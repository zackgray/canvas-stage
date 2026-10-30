"""Surround pick, step 1 (free, local): the E57 global Lab colour match of a candidate panorama to its still.

    <venv>/Scripts/python -I scripts/surround_match.py --location public/lab-assets/locations/<id> \
        --pano <candidate png> --out <matched png> [--up x,y,z]

One Lab mean/std transform (std ratio clipped 0.6..2.5) taking the generated pixels in the footprint's rows to the still's
footprint, then a low-frequency edge correction carried out from the footprint border and faded over 160 px. This is E57's
"option 3 + colour match" (experiments/e57_opt3cm.py: e57_opt1's "global" variant + its edge feather), the best arm. The
per-row variant over-saturates the sky (E57) and is deliberately not offered.
Out: <out> (2048x1024 RGB) and <out>.json (the transform's stats). The still's own footprint is then pasted back from the
still itself (E57's paste, e57_common.paste): the global transform would otherwise re-contrast it, and in the app the
footprint shows wherever the set has no geometry (the approved frame's sky, depth holes). The join is the same 160 px edge
feather above, which carries the still's residual outward from that border (docs/world-stage1-review.md F4).
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import cv2
import numpy as np
from PIL import Image
from surround_canvas import PH, PW, level_basis, load_location, read_level_up, still_in_pano

FEATHER = 160


def lab(a: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(a, cv2.COLOR_RGB2LAB).astype(np.float32)


def unlab(a: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(np.clip(a, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)


def footprint(loc: Path, up) -> tuple[np.ndarray, np.ndarray]:
    """(the still resampled into the level pano, its footprint eroded off the resampled border), as E57 still_setup."""
    rgb, _, vfov = load_location(loc)
    pano, inside, _ = still_in_pano(rgb, vfov, level_basis(up))
    keep = cv2.erode(inside.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=2) > 0
    return pano, keep


def match(gen: np.ndarray, still: np.ndarray, keep: np.ndarray, feather: int = FEATHER) -> tuple[np.ndarray, dict]:
    """E57 opt3cm: global Lab mean/std match from the footprint rows, then the edge feather. Returns (rgb uint8, stats)."""
    S, G = lab(still), lab(gen)
    H, W = keep.shape
    outside = ~cv2.dilate(keep.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    rows = np.nonzero(keep.any(1))[0]
    band = np.zeros((H, W), bool)
    band[rows.min():rows.max() + 1] = True
    x, y = G[outside & band], S[keep]
    mu_g, sd_g, mu_s, sd_s = x.mean(0), x.std(0) + 1e-3, y.mean(0), y.std(0) + 1e-3
    ratio = np.clip(sd_s / sd_g, 0.6, 2.5)
    graded = (G - mu_g) * ratio + mu_s
    # the edge feather: the remaining colour residual at the footprint edge, carried outward and faded over `feather` px
    D = S - lab(unlab(graded))
    inner = cv2.distanceTransform(keep.astype(np.uint8), cv2.DIST_L2, 5)
    ring = ((inner > 0) & (inner < 14)).astype(np.float32)
    blur = lambda a: cv2.GaussianBlur(a, (0, 0), 55, borderType=cv2.BORDER_REPLICATE)
    corr = np.stack([blur(D[..., c] * ring) for c in range(3)], -1) / (blur(ring)[..., None] + 1e-6)
    outd = cv2.distanceTransform((~keep).astype(np.uint8), cv2.DIST_L2, 5)
    w = np.clip(1 - outd / feather, 0, 1)[..., None]
    w = w * w * (3 - 2 * w)
    out = unlab(lab(unlab(graded)) + corr * w)
    out = np.where(keep[..., None], still, out).astype(np.uint8)  # the footprint IS the still, not a graded copy of it
    stats = {"method": "e57-global-lab+edge-feather", "feather": feather, "meanGen": [round(float(v), 2) for v in mu_g],
             "meanStill": [round(float(v), 2) for v in mu_s], "stdRatio": [round(float(v), 3) for v in ratio]}
    return out, stats


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--location", required=True)
    ap.add_argument("--pano", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--up", help="x,y,z: the level frame the batch's canvas was drawn in, default = <location>/level.json")
    a = ap.parse_args(argv)
    loc, out = Path(a.location), Path(a.out)
    up = [float(v) for v in a.up.split(",")] if a.up else read_level_up(loc)
    still, keep = footprint(loc, up)
    if not keep.any():
        print("the still has no footprint in the pano", file=sys.stderr)
        return 2
    gen = np.array(Image.open(a.pano).convert("RGB").resize((PW, PH), Image.LANCZOS))
    matched, stats = match(gen, still, keep)
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(matched).save(out)
    Path(f"{out}.json").write_text(json.dumps(stats) + "\n")
    print(json.dumps(stats), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
