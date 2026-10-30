"""Surround suggestion (free, local): score each candidate by how well it meets the still at the footprint border.

    <venv>/Scripts/python -I scripts/surround_score.py --location public/lab-assets/locations/<id> --up x,y,z \
        --out <scores.json> --pano <a.png> --pano <b.png> ...

Each candidate first gets the same global Lab colour match the pick runs (surround_match.py), so the score predicts the
installed surround. Then, E57's measurement of the visible step, at the footprint border:
  colour  mean Lab distance between the still's local mean colour just inside the border and the candidate's just outside
          (normalised Gaussian means over 16 px rings, sigma 12 px);
  texture |log| of the ratio of high-frequency energy (mean |Laplacian|) outside vs inside: a soft or over-busy surround
          against a sharp still reads as a pasted picture.
score = colour + 10 * texture (lower is better). Out: {"scores": [{"pano", "score", "colour", "texture"}]}.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import cv2
import numpy as np
from PIL import Image
from surround_canvas import PH, PW
from surround_match import footprint, lab, match

RING, SIGMA, TEXTURE_WEIGHT = 16, 12.0, 10.0


def local_mean(img: np.ndarray, w: np.ndarray) -> np.ndarray:
    blur = lambda a: cv2.GaussianBlur(a, (0, 0), SIGMA, borderType=cv2.BORDER_REPLICATE)
    return np.stack([blur(img[..., c] * w) for c in range(3)], -1) / (blur(w)[..., None] + 1e-6)


def hf(img: np.ndarray) -> np.ndarray:
    return np.abs(cv2.Laplacian(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32), cv2.CV_32F))


def border_score(gen: np.ndarray, still: np.ndarray, keep: np.ndarray) -> dict:
    inner_d = cv2.distanceTransform(keep.astype(np.uint8), cv2.DIST_L2, 5)
    outer_d = cv2.distanceTransform((~keep).astype(np.uint8), cv2.DIST_L2, 5)
    inner = ((inner_d > 0) & (inner_d <= RING)).astype(np.float32)
    outer = ((outer_d > 0) & (outer_d <= RING)).astype(np.float32)
    at = outer > 0
    m_in, m_out = local_mean(lab(still), inner), local_mean(lab(gen), outer)
    colour = float(np.linalg.norm(m_in[at] - m_out[at], axis=-1).mean())
    t_in = float(hf(still)[inner > 0].mean()) + 1e-3
    t_out = float(hf(gen)[at].mean()) + 1e-3
    texture = abs(float(np.log(t_out / t_in)))
    return {"score": round(colour + TEXTURE_WEIGHT * texture, 3), "colour": round(colour, 3), "texture": round(texture, 4)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--location", required=True)
    ap.add_argument("--up", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pano", action="append", required=True)
    a = ap.parse_args(argv)
    still, keep = footprint(Path(a.location), [float(v) for v in a.up.split(",")])
    rows = []
    for p in a.pano:
        gen = np.array(Image.open(p).convert("RGB").resize((PW, PH), Image.LANCZOS))
        matched, _ = match(gen, still, keep)
        rows.append({"pano": p, **border_score(matched, still, keep)})
        print(json.dumps(rows[-1]), flush=True)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"scores": rows}, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
