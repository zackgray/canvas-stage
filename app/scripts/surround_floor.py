"""The surround's own ground (free, CPU): a RANSAC plane on the panorama's distance below the horizon (E59 floor check).

    <venv>/Scripts/python -I scripts/surround_floor.py --dist <surround-dist.png> --mpu <metres per unit> --out <floor.json>

surround-dist.png is the level equirect's distance along each ray (scripts/surround_depth.py: 16-bit, value * mpu metres,
0 = sky), already scaled to the still's MoGe depth. The plane is fitted to the points below -12 deg latitude and nearer than
40 m, with a tolerance that grows with distance (8 % of the range, E59). Shoot matches the surround's ground to the set's with
it (meta.json surround.floor, docs/perform-contract.md).
Out: {up: unit normal in the surround's level frame (three.js axes, +y up), heightM: the camera's height over the plane in the
distance's units (the still's MoGe metres, the same units as level.json cameraHeightM), inliers, samples, tiltDeg, method}.
method "floor-ransac", or "none" (too few ground points or inliers: no floor is written, so no ground match is drawn).
"""
import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import numpy as np
from PIL import Image
from surround_canvas import pano_dirs

LAT_MAX_DEG = -12.0
NEAR_M = 40.0
TOL = 0.08
ITERS = 400
MIN_POINTS = 200
MIN_INLIERS = 0.3
MIN_UP_Y = 0.8


def fit(dist: np.ndarray, seed: int = 0) -> dict:
    h, w = dist.shape
    d = pano_dirs(w, h)
    lat = np.degrees(np.arcsin(np.clip(d[..., 1], -1, 1)))
    sel = (dist > 0) & (lat < LAT_MAX_DEG) & (dist < NEAR_M)
    P = (d * dist[..., None])[sel]
    if len(P) < MIN_POINTS:
        return {"method": "none", "samples": int(len(P)), "inliers": 0.0}
    rng = np.random.default_rng(seed)
    pts = P[rng.choice(len(P), min(len(P), 30000), replace=False)]
    rng_m = np.maximum(np.linalg.norm(pts, axis=1), 1.0)
    best = None
    for _ in range(ITERS):
        s = pts[rng.choice(len(pts), 3, replace=False)]
        n = np.cross(s[1] - s[0], s[2] - s[0])
        ln = np.linalg.norm(n)
        if ln < 1e-9:
            continue
        n = n / ln
        if n[1] < 0:
            n = -n
        if n[1] < MIN_UP_Y:
            continue
        off = -n @ s[0]
        share = float((np.abs(pts @ n + off) < TOL * rng_m).mean())
        if best is None or share > best[0]:
            best = (share, n, off)
    if best is None or best[0] < MIN_INLIERS:
        return {"method": "none", "samples": int(len(pts)), "inliers": round(best[0], 3) if best else 0.0}
    inl = pts[np.abs(pts @ best[1] + best[2]) < TOL * rng_m]
    c = inl.mean(0)
    n = np.linalg.svd(inl - c)[2][-1]
    n = n if n[1] > 0 else -n
    height = abs(float(n @ c))  # the plane through c with normal n is |n.c| from the camera at the origin
    return {"method": "floor-ransac", "up": [round(float(v), 5) for v in n], "heightM": round(height, 3),
            "inliers": round(best[0], 3), "samples": int(len(pts)), "tiltDeg": round(math.degrees(math.acos(min(1.0, float(n[1])))), 2)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dist", required=True)
    ap.add_argument("--mpu", type=float, required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    dist = np.array(Image.open(a.dist)).astype(np.float32) * a.mpu
    out = fit(dist)
    Path(a.out).write_text(json.dumps(out) + "\n")
    print(json.dumps(out), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
