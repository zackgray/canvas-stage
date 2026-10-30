"""One clay frame, shaded exactly as experiments/e102_clay.py does it (E96 clay with the face SCULPTED, not blanked).

  person  = depth in front of the performance-hidden depth: neutral grey clay shaded from his own geometry (depth bilateral-smoothed
            first; the lift's per-pixel relief is noisy), one key light in camera space + a soft fill from above;
  face    = inside an ellipse round his face the depth gets a much stronger edge-preserving smoothing, so the noise is gone but eye
            sockets, brow, nose and cheekbones stay as soft forms (E102: near-eye sharpness 16 -> 36 against a blanked face);
  world   = NOT shaded from geometry (true world geometry shows mesh triangles at long lenses, E96): a smoothed, desaturated luma copy
            of the colour render squeezed to mid-grey, with the sliver of far surround shell beside the set inpainted from the set first.
Pure numpy / OpenCV, no files: clay.py drives it."""
import cv2
import numpy as np

# E96's key: camera-right, a little above and in front (camera space: x right, y up, z toward the viewer)
DEFAULT_KEY = (0.75, 0.25, 0.62)


def unit(v):
    v = np.asarray(v, np.float64)
    n = np.linalg.norm(v)
    if not np.isfinite(n) or n < 1e-9:
        raise ValueError(f"light direction {list(v)} has no length")
    return v / n


def normals(D, fy):
    """camera-space normals from planar depth, back-projected through the frame's own focal (px), facing the camera"""
    H, W = D.shape
    v, u = np.mgrid[0:H, 0:W].astype(np.float32)
    Ds = cv2.blur(D, (3, 3))
    P = np.stack([(u - W / 2 + .5) / fy * Ds, -(v - H / 2 + .5) / fy * Ds, -Ds], -1)
    du = np.zeros_like(P)
    dv = np.zeros_like(P)
    du[:, 1:-1] = P[:, 2:] - P[:, :-2]
    dv[1:-1] = P[2:] - P[:-2]
    n = np.cross(dv, du)
    n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-9
    n[n[..., 2] < 0] *= -1
    return n


def shade(col, D, B, fy, face, key):
    """col BGR uint8 (H, W, 3); D, B planar depth with / without the performer (0 = nothing); fy focal in px;
    face (cx, cy, rx, ry) in px or None; key a unit camera-space vector. -> (H, W) uint8 clay, and the person share."""
    H, W = D.shape
    person = (D > 0) & ((B <= 0) | (D < B - 1e-3))
    Dp = np.where(person, D, np.float32(np.median(D[person])) if person.any() else D).astype(np.float32)
    for _ in range(2):
        Dp = cv2.bilateralFilter(Dp, 9, 0.05, 4)
    if face is not None:
        cx, cy, rx, ry = face
        el = np.zeros((H, W), np.float32)
        cv2.ellipse(el, (int(cx), int(cy)), (int(rx * 1.15), int(ry * 1.1)), 0, 0, 360, 1, -1)
        el = cv2.GaussianBlur(el, (0, 0), max(2, rx / 5)) * person
        Df = Dp.copy()
        sp = max(5.0, rx / 10)
        dk = int(max(9, min(51, rx / 3))) | 1
        for _ in range(6):
            Df = cv2.bilateralFilter(Df, dk, 0.05, sp)
        Df = cv2.GaussianBlur(Df, (0, 0), max(2.0, rx / 14))
        Dm = Dp * (1 - el) + Df * el
    else:
        Dm = Dp
    n = normals(Dm.astype(np.float32), fy)
    lam = np.clip((n * key).sum(-1), 0, 1)
    fill = 0.5 + 0.5 * n[..., 1]
    shade_p = 0.16 + 0.62 * lam + 0.10 * fill
    far = (D > 500) & ~person
    seam = cv2.dilate(far.astype(np.uint8), np.ones((25, 25), np.uint8)) & (~person).astype(np.uint8)
    g8 = cv2.cvtColor(col, cv2.COLOR_BGR2GRAY)
    if seam.any():
        g8 = cv2.inpaint(g8, seam * 255, 9, cv2.INPAINT_TELEA)
    s = g8.astype(np.float32) / 255
    for _ in range(3):
        s = cv2.bilateralFilter(s, 9, 0.10, 5)
    lo, hi = np.percentile(s[~person], (2, 98)) if (~person).any() else (0, 1)
    back = 0.25 + 0.45 * np.clip((s - lo) / (hi - lo + 1e-6), 0, 1)
    img = np.where(person, 0.58 * shade_p / 0.6, back)
    return (np.clip(img, 0, 1) * 255).astype(np.uint8), float(person.mean())
