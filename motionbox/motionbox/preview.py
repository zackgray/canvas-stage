"""Stick-figure strip of a retargeted CMU BVH (side + front), adapted from the spike's
tools/render_bvh.py but with a small built-in rasteriser instead of matplotlib, so the service
needs no plotting dependency. `prop=True` draws the held frame (0.48 x 0.23 m, Langstroth deep)
on the wrist-midpoint recipe: top bar along the wrist vector, hanging world-down.
"""
import zlib, struct
import numpy as np

from .bvh import load

W, Hh = 220, 260          # cell size in pixels
N = 10                    # frames per row
COL = {"L": (200, 60, 60), "R": (60, 90, 200), "k": (30, 30, 30), "hand": (230, 140, 30), "prop": (190, 150, 40)}


def _png(path, img):
    """Write an (H,W,3) uint8 array as a truecolour PNG (no dependencies)."""
    h, w, _ = img.shape
    raw = b"".join(b"\x00" + img[y].tobytes() for y in range(h))
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def _line(img, x0, y0, x1, y1, col, thick=2):
    n = int(max(abs(x1 - x0), abs(y1 - y0), 1)) * 2
    for t in np.linspace(0, 1, n + 1):
        x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
        for dx in range(-thick // 2, thick // 2 + 1):
            for dy in range(-thick // 2, thick // 2 + 1):
                if 0 <= y + dy < img.shape[0] and 0 <= x + dx < img.shape[1]:
                    img[y + dy, x + dx] = col


def _dot(img, x, y, col, r=3):
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if 0 <= y + dy < img.shape[0] and 0 <= x + dx < img.shape[1]:
                img[y + dy, x + dx] = col


def _frame_prop(P, n, f):
    """wrist-midpoint recipe: top bar along the wrist axis, hanging 'down' from the bar along the hands' mean down-vector"""
    l, r = P[f, n["LeftHand"]], P[f, n["RightHand"]]
    x = (l - r) / np.linalg.norm(l - r); mid = (l + r) / 2
    up = np.array([0, 1.0, 0]); down = -(up - x * x.dot(up)); down /= np.linalg.norm(down)
    w, h = 0.48, 0.23
    return np.array([mid - x * w / 2, mid + x * w / 2, mid + x * w / 2 + down * h, mid - x * w / 2 + down * h, mid - x * w / 2])


def strip(bvh_path, out_path, prop=False):
    """Render a 2 x 10 strip (side, then front) of the BVH at bvh_path to a PNG."""
    b = load(bvh_path)
    joints, P, n, floor = b["joints"], b["P"], b["n"], b["floor"]
    F = b["frames"]
    idx = np.linspace(0, F - 1, N).astype(int)
    img = np.full((2 * Hh, N * W, 3), 255, np.uint8)
    scale = (Hh - 30) / 2.0      # 2 m tall figure fits the cell
    for row, ax in enumerate((2, 0)):   # side (+Z), front (+X)
        for c, f in enumerate(idx):
            ox, oy = c * W, row * Hh
            for j, jt in enumerate(joints):
                p = jt["parent"]
                if p < 0:
                    continue
                col = COL["L"] if jt["name"].startswith("L") else (COL["R"] if jt["name"].startswith("R") else COL["k"])
                x0 = ox + W // 2 + (P[f, j, ax] - P[f, 0, ax]) * scale
                y0 = oy + Hh - 12 - (P[f, j, 1] - floor) * scale
                x1 = ox + W // 2 + (P[f, p, ax] - P[f, 0, ax]) * scale
                y1 = oy + Hh - 12 - (P[f, p, 1] - floor) * scale
                _line(img, x0, y0, x1, y1, col)
            for s in ("LeftHand", "RightHand"):
                _dot(img, int(ox + W // 2 + (P[f, n[s], ax] - P[f, 0, ax]) * scale),
                     int(oy + Hh - 12 - (P[f, n[s], 1] - floor) * scale), COL["hand"])
            if prop:
                pr = _frame_prop(P, n, f)
                for a in range(4):
                    _line(img, ox + W // 2 + (pr[a, ax] - P[f, 0, ax]) * scale, oy + Hh - 12 - (pr[a, 1] - floor) * scale,
                          ox + W // 2 + (pr[a + 1, ax] - P[f, 0, ax]) * scale, oy + Hh - 12 - (pr[a + 1, 1] - floor) * scale,
                          COL["prop"], thick=1)
    _png(out_path, img)
    return out_path
