"""Where his face is on every clay frame, as the ellipse e96_clay.face_ellipse draws (centre a little below the eye midpoint,
0.55 x 0.75 of the face width): either given (faces.json: {"frames": [[cx, cy, rx, ry] | null, ...]} in px) or found with
YuNet (OpenCV Zoo face_detection_yunet_2023mar, MIT) on the colour pass, the way E99/E100 found it (e88_faceid.py).

YuNet per frame: the most confident face whose eye midpoint sits on the performer (depth in front of the background depth),
searched at full, half and quarter size (YuNet misses faces far bigger than its anchors: a close-up's); if none is found (a
small face in a wide), the performer's box is searched again upscaled. Missing frames are
filled by interpolating the frames either side (held at the ends), then centre and size are smoothed over +-2 frames so the
sculpt does not jitter. No face anywhere -> None per frame: the figure is shaded without a face sculpt."""
import json

import cv2
import numpy as np


def ellipse(ex, ey, fw):
    return (ex, ey + 0.30 * fw, 0.55 * fw, 0.75 * fw)


def load(path, n):
    rows = json.load(open(path))["frames"]
    if len(rows) != n:
        raise ValueError(f"faces.json has {len(rows)} frames, the clay has {n}")
    return [tuple(r) if r else None for r in rows]


class YuNet:
    def __init__(self, model):
        self.det = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.6, 0.3, 5000)

    def _run(self, img):
        h, w = img.shape[:2]
        self.det.setInputSize((w, h))
        _, rows = self.det.detect(img)
        return [] if rows is None else rows

    def find(self, col, person):
        """-> (eye mid x, eye mid y, face box width) in px, or None"""
        H, W = person.shape
        # YuNet misses faces much bigger than its anchors (a 400 px face at 1920 is not found, the same face at 960 is):
        # search the frame at full, half and quarter size and keep the most confident hit
        cands = []
        for s in (1.0, 0.5, 0.25):
            im = col if s == 1.0 else cv2.resize(col, (round(W * s), round(H * s)), interpolation=cv2.INTER_AREA)
            cands += [(r, s, 0, 0) for r in self._run(im)]
        if not cands and person.any():
            ys, xs = np.nonzero(person)
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            pad = int(0.1 * max(x1 - x0, y1 - y0))
            x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
            crop = col[y0:y1, x0:x1]
            s = min(3.0, 4096 / max(crop.shape[:2]))
            if s > 1.2:
                up = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
                cands = [(r, s, x0, y0) for r in self._run(up)]
        best = None
        for r, s, ox, oy in cands:
            ex = (r[4] + r[6]) / 2 / s + ox
            ey = (r[5] + r[7]) / 2 / s + oy
            xi, yi = int(np.clip(ex, 0, W - 1)), int(np.clip(ey, 0, H - 1))
            if not person[yi, xi]:
                continue  # a face in the world (a poster, a reflection), not his
            if best is None or r[14] > best[3]:
                best = (ex, ey, r[2] / s, r[14])
        return None if best is None else best[:3]


def track(hits):
    """per-frame (ex, ey, fw) or None -> per-frame ellipse or None; gaps interpolated, +-2 frame smoothing"""
    n = len(hits)
    idx = [i for i, h in enumerate(hits) if h is not None]
    if not idx:
        return [None] * n
    a = np.array([hits[i] for i in idx], np.float64)
    full = np.stack([np.interp(np.arange(n), idx, a[:, c]) for c in range(3)], 1)
    k = 2
    pad = np.pad(full, ((k, k), (0, 0)), mode="edge")
    sm = np.stack([pad[i:i + 2 * k + 1].mean(0) for i in range(n)])
    return [ellipse(*row) for row in sm]
