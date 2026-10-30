"""Surround step 1 (free): the outpaint canvas for a registered location.

    <venv>/Scripts/python -I scripts/surround_canvas.py --location public/lab-assets/locations/<id> --out <dir> [--feather 64]

The still is resampled into a LEVEL 2048x1024 equirect at its true yaw (centre column), pitch and FOV. "Level" comes from
<location>/level.json `up` (scripts/location_level.py); a missing file means the app's assumed 4.3 deg pitch. Everything
outside the still's footprint is to be generated; each unknown pixel starts as the median colour of the known pixels in its
row (a grey canvas is kept by the model, E46 v1), blurred.
Out (in --out): canvas.png (still + colour prior), mask.png (white = generate; the still's border is reworkable over
--feather px, E48: 24 px kept a framed picture; the app runs 180, E57 option 3), seam-mask.png (the E59 wrap-seam band
in the 50 %-rolled pano: 96 px full strength + 56 px smoothstep each side, for the same job's seam pass), keep-mask.png
(white = the still's footprint eroded 2x5 px: recipe pano-590011 pastes the still back through it before the harmonise,
E57 `paste`), footprint.png, canvas.json (footprint extents + vfovDeg, the FOV the still was placed at: a pano-first pick
cuts the master back out at exactly this FOV).
The still: <location>/approved/still.png when present (a pano-first pick re-cuts still.png from the pano and keeps the
approved still there, so a re-roll pastes the frame the owner approved, not its redraw), else still.png.
The lens: meta.json lens.vfovDeg when lens.from is "known" (a crop cut at a known FOV, D19), else raw/vfov.txt, else the
meta lens.
The maths is server/surround/equirect.ts; this file and that one must agree (the vitest round trip covers the TS side).
Port of experiments/e46_canvas.py + e48_canvas.py + e46_geom.py.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

PW, PH = 2048, 1024
ASSUMED_PITCH_DEG = 4.3
SEAM_CORE, SEAM_SOFT = 48, 56  # E59: full-strength half-width and smoothstep width, px


def seam_mask(w: int = PW, h: int = PH) -> np.ndarray:
    """E59's soft vertical band about the centre column of the ROLLED pano (= the 0/360 wrap), 0..1."""
    x = np.abs(np.arange(w) + 0.5 - w / 2)
    t = np.clip((x - SEAM_CORE) / SEAM_SOFT, 0, 1)
    return np.repeat((1 - t * t * (3 - 2 * t))[None, :], h, 0)


def assumed_up(pitch_deg: float = ASSUMED_PITCH_DEG) -> np.ndarray:
    p = math.radians(pitch_deg)
    return np.array([0.0, math.cos(p), math.sin(p)])


def level_basis(up) -> np.ndarray:
    """R (3x3): camera = R @ level. Columns = level X, Y (= up), Z (= -forward)."""
    y = np.asarray(up, float)
    y = y / np.linalg.norm(y)
    f = np.array([0.0, 0.0, -1.0]) - y * (-y[2])  # the still's forward minus its up component
    f /= np.linalg.norm(f)
    z = -f
    x = np.cross(y, z)
    return np.stack([x, y, z], 1)


def pano_dirs(w: int = PW, h: int = PH) -> np.ndarray:
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    lon, lat = np.meshgrid((u - 0.5) * 2 * math.pi, (0.5 - v) * math.pi)
    return np.stack([np.cos(lat) * np.sin(lon), np.sin(lat), -np.cos(lat) * np.cos(lon)], -1)


def dirs_to_uv(d: np.ndarray):
    d = d / np.linalg.norm(d, axis=-1, keepdims=True)
    return np.arctan2(d[..., 0], -d[..., 2]) / (2 * math.pi) + 0.5, 0.5 - np.arcsin(np.clip(d[..., 1], -1, 1)) / math.pi


def tan_half(vfov_deg: float, w: int, h: int):
    ty = math.tan(math.radians(vfov_deg) / 2)
    return ty * w / h, ty


def read_level_up(loc: Path) -> np.ndarray:
    f = loc / "level.json"
    if f.exists():
        up = json.loads(f.read_text()).get("up")
        if up and len(up) == 3:
            return np.asarray(up, float)
    return assumed_up()


def lens_vfov(loc: Path, meta: dict) -> float:
    """The still's vertical FOV: a KNOWN lens (meta lens.from == "known") wins; else raw/vfov.txt, as in E48; else the meta lens."""
    lens = meta.get("lens") or {}
    if lens.get("from") == "known" and lens.get("vfovDeg"):
        return float(lens["vfovDeg"])
    vf = loc / "raw" / "vfov.txt"
    return float(vf.read_text().strip()) if vf.exists() else float(lens["vfovDeg"])


def load_location(loc: Path, approved: bool = False):
    """(rgb uint8 HxWx3, depth metres HxW (0 = invalid), vfov degrees). `approved`: the approved still when one was kept."""
    meta = json.loads((loc / "meta.json").read_text())
    depth = np.array(Image.open(loc / "depth-moge-2.png")).astype(np.float32) * float(meta["depth"]["metersPerUnit"])
    still = loc / "approved" / "still.png" if approved and (loc / "approved" / "still.png").exists() else loc / "still.png"
    rgb = np.array(Image.open(still).convert("RGB"))
    return rgb, depth, lens_vfov(loc, meta)


def still_in_pano(img: np.ndarray, vfov: float, R: np.ndarray, w: int = PW, h: int = PH, interp=cv2.INTER_LINEAR):
    """Resample a still-camera image into the level pano. Returns (pano, footprint bool, (px, py, fwd))."""
    sh, sw = img.shape[:2]
    tx, ty = tan_half(vfov, sw, sh)
    d = pano_dirs(w, h) @ R.T  # level -> camera
    fwd = -d[..., 2]
    ok = fwd > 1e-3
    with np.errstate(divide="ignore", invalid="ignore"):
        nx = np.where(ok, d[..., 0] / fwd / tx, 9)
        ny = np.where(ok, d[..., 1] / fwd / ty, 9)
    px = ((nx + 1) / 2 * sw - 0.5).astype(np.float32)
    py = ((1 - ny) / 2 * sh - 0.5).astype(np.float32)
    inside = ok & (np.abs(nx) <= 1) & (np.abs(ny) <= 1)
    return cv2.remap(img, px, py, interp, borderMode=cv2.BORDER_CONSTANT), inside, (px, py, fwd)


def build_canvas(rgb: np.ndarray, vfov: float, up, feather: int, with_keep: bool = False):
    R = level_basis(up)
    pano, inside, _ = still_in_pano(rgb, vfov, R)
    keep = cv2.erode(inside.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=2)  # drop the resampled border
    dist = cv2.distanceTransform(keep, cv2.DIST_L2, 5)
    mask = np.maximum(1.0 - keep, np.clip(1 - dist / float(feather), 0, 1) * 0.85)
    rows = np.nonzero(keep.any(1))[0]
    med = {y: np.median(pano[y][keep[y] > 0], 0) for y in rows}
    prior = np.zeros_like(pano)
    for y in range(PH):
        prior[y] = med[rows[np.argmin(np.abs(rows - y))]]
    prior = cv2.GaussianBlur(prior, (0, 0), 6)
    canvas = np.where(keep[..., None] > 0, pano, prior).astype(np.uint8)
    return (canvas, mask, inside, keep > 0) if with_keep else (canvas, mask, inside)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--location", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--feather", type=int, default=64)
    a = ap.parse_args(argv)
    loc, out = Path(a.location), Path(a.out)
    for need in ("meta.json", "depth-moge-2.png", "still.png"):
        if not (loc / need).exists():
            print(f"{loc}: no {need} (register the location first)", file=sys.stderr)
            return 2
    out.mkdir(parents=True, exist_ok=True)
    rgb, _, vfov = load_location(loc, approved=True)
    canvas, mask, inside, keep = build_canvas(rgb, vfov, read_level_up(loc), a.feather, with_keep=True)
    Image.fromarray(canvas).save(out / "canvas.png")
    Image.fromarray((mask * 255).astype(np.uint8)).save(out / "mask.png")
    Image.fromarray((keep * 255).astype(np.uint8)).save(out / "keep-mask.png")
    Image.fromarray((seam_mask() * 255).astype(np.uint8)).save(out / "seam-mask.png")
    Image.fromarray((inside * 255).astype(np.uint8)).save(out / "footprint.png")
    ys, xs = np.nonzero(inside)
    info = {"footprintShare": round(float(inside.mean()), 4), "lonDeg": [round((xs.min() / PW - .5) * 360), round((xs.max() / PW - .5) * 360)],
            "latDeg": [round((.5 - ys.max() / PH) * 180), round((.5 - ys.min() / PH) * 180)], "feather": a.feather,
            "vfovDeg": round(vfov, 4), "still": [int(rgb.shape[1]), int(rgb.shape[0])]}
    (out / "canvas.json").write_text(json.dumps(info) + "\n")
    print(json.dumps(info))
    return 0


if __name__ == "__main__":
    sys.exit(main())
