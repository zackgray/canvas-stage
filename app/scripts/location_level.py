"""Level a registered location: fit its floor plane from its own MoGe-2 depth and write <location>/level.json.

    <venv>/Scripts/python -I scripts/location_level.py --location public/lab-assets/locations/<id> [--dry-run]

Port of experiments/e48_align.py's floor RANSAC (E48 fit_floor). Reads, from the location folder:
  depth-moge-2.png  16-bit linear metres (near-dark, 0 = sky/invalid), scale meta.json depth.metersPerUnit
  meta.json         depth.metersPerUnit, lens.vfovDeg (a KNOWN lens, lens.from == "known", wins: a pano-first master cut
                    at a known FOV, D19; else raw/vfov.txt, when present, wins as in E48)
Writes level.json (docs/chain-contract.md, "location level.json"):
  up              unit vector, world up in the still's camera space (three.js axes: +x right, +y up, -z forward)
  cameraHeightM   camera height over the fitted floor in metres, or null when the floor could not be fitted
  inliers         share (0..1) of the sampled near-floor points inside 4 cm of the plane; 0 on the fallback
  method          "floor-ransac" | "assumed"  (assumed = too few inliers; up is the app's assumption, see below)
  + vfovDeg, samples, assumedPitchDeg, tiltFromAssumedDeg (angle between up and the app's assumed up), fitted (ISO time)
The assumed up is the app's own world: it orbits about camera +Y after a fixed downward pitch (ASSUMED_PITCH_DEG), so
up = (0, cos p, sin p). Nothing here is specific to one location: any still that shows some floor fits.
"""
import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

ASSUMED_PITCH_DEG = 4.3  # what the app assumes about every still (E48: the warehouse floor disagreed by 6.7 deg)
MIN_INLIER_SHARE = 0.15  # below this the "floor" is not a floor (a wall or a tangle); fall back
MIN_SAMPLES = 2000
LOW_ROWS = 0.55  # the floor is looked for in the lower 45 % of the still
Z_NEAR, Z_FAR = 0.3, 25.0
TOL_M = 0.04
ITERS = 600
MAX_POINTS = 40000
MIN_UP_Y = 0.8  # floor normals within ~37 deg of the camera's up


def assumed_up(pitch_deg: float = ASSUMED_PITCH_DEG) -> np.ndarray:
    p = math.radians(pitch_deg)
    return np.array([0.0, math.cos(p), math.sin(p)])


def load_depth(loc: Path) -> tuple[np.ndarray, float]:
    """(H, W) metres (0 = invalid) and the vertical field of view in degrees."""
    meta = json.loads((loc / "meta.json").read_text())
    scale = float(meta["depth"]["metersPerUnit"])
    depth = np.array(Image.open(loc / "depth-moge-2.png")).astype(np.float32) * scale
    lens = meta.get("lens") or {}
    if lens.get("from") == "known" and lens.get("vfovDeg"):
        return depth, float(lens["vfovDeg"])  # D19: the corrected lens, never MoGe's raw estimate
    vf = loc / "raw" / "vfov.txt"
    vfov = float(vf.read_text().strip()) if vf.exists() else float(lens["vfovDeg"])
    return depth, vfov


def unproject(depth: np.ndarray, vfov_deg: float) -> np.ndarray:
    """(H, W) planar depth -> (H, W, 3) camera-space points (three.js axes, pixel centres)."""
    h, w = depth.shape
    ty = math.tan(math.radians(vfov_deg) / 2)
    tx = ty * w / h
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (xs + 0.5) / w * 2 - 1
    ny = 1 - (ys + 0.5) / h * 2
    return np.stack([nx * tx * depth, ny * ty * depth, -depth], -1)


def fit_floor(depth: np.ndarray, vfov: float, seed: int = 0):
    """RANSAC plane on the near points of the lower rows. Returns (up, height_m, inlier_share, samples) or None."""
    P = unproject(depth, vfov)
    sel = P[int(depth.shape[0] * LOW_ROWS):].reshape(-1, 3)
    z = -sel[:, 2]
    sel = sel[(z > Z_NEAR) & (z < Z_FAR)]
    if len(sel) < MIN_SAMPLES:
        return None
    rng = np.random.default_rng(seed)
    sel = sel[rng.choice(len(sel), min(len(sel), MAX_POINTS), replace=False)]
    best, bn, bd = 0, None, 0.0
    for _ in range(ITERS):
        a, b, c = sel[rng.choice(len(sel), 3, replace=False)]
        n = np.cross(b - a, c - a)
        norm = np.linalg.norm(n)
        if norm < 1e-6:
            continue
        n = n / norm
        if n[1] < 0:
            n = -n
        if n[1] < MIN_UP_Y:
            continue
        dd = -n @ a
        k = int((np.abs(sel @ n + dd) < TOL_M).sum())
        if k > best:
            best, bn, bd = k, n, dd
    if bn is None:
        return None
    inl = sel[np.abs(sel @ bn + bd) < TOL_M]  # refine by least squares on the inliers
    c = inl.mean(0)
    n = np.linalg.svd(inl - c)[2][-1]
    n = n if n[1] > 0 else -n
    return n, float(-(n @ c)), best / len(sel), len(sel)


def level(loc: Path, assumed_pitch: float = ASSUMED_PITCH_DEG) -> dict:
    depth, vfov = load_depth(loc)
    fit = fit_floor(depth, vfov)
    a_up = assumed_up(assumed_pitch)
    if fit is not None and fit[2] >= MIN_INLIER_SHARE:
        up, height, share, samples = fit
        method = "floor-ransac"
    else:
        up, height, share, samples = a_up, None, 0.0, fit[3] if fit else 0
        method = "assumed"
    tilt = math.degrees(math.acos(float(np.clip(up @ a_up, -1, 1))))
    return {
        "up": [round(float(v), 5) for v in up],
        "cameraHeightM": None if height is None else round(height, 3),
        "inliers": round(share, 3),
        "method": method,
        "vfovDeg": round(vfov, 2),
        "samples": int(samples),
        "assumedPitchDeg": assumed_pitch,
        "tiltFromAssumedDeg": round(tilt, 2),
        "fitted": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--location", required=True, help="a locations/<id> folder (depth-moge-2.png + meta.json)")
    ap.add_argument("--assumed-pitch-deg", type=float, default=ASSUMED_PITCH_DEG, help="fallback: the app's assumed downward pitch")
    ap.add_argument("--dry-run", action="store_true", help="print, do not write level.json")
    a = ap.parse_args(argv)
    loc = Path(a.location)
    for need in ("meta.json", "depth-moge-2.png"):
        if not (loc / need).exists():
            print(f"{loc}: no {need} (register the location first)", file=sys.stderr)
            return 2
    out = level(loc, a.assumed_pitch_deg)
    text = json.dumps(out, indent=2) + "\n"
    if not a.dry_run:
        (loc / "level.json").write_text(text)
    print(text, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
