"""How many faces a drawn still has, free and local, for the still judge: YuNet (OpenCV Zoo face_detection_yunet_2023mar, MIT, the
tracked copy under scripts/clay/models) at full, half and quarter size as scripts/clay/faces.py searches (YuNet misses faces far
bigger than its anchors), every detection above 0.6 confidence that also clears the floor below, the same face found at two scales merged by overlap.
  count_faces.py --in <png> --yunet <onnx> --json <out>
writes {"seen": n, "boxes": [{"x","y","w","h","score"}, ...]} in the still's pixels; exit 0 = written."""
import argparse
import json
import sys

import cv2

SCORE = 0.6
# The floor: a hit below MIN_SCORE, or a box under MIN_SIDE of the image's shorter side, is texture (tree canopy, fabric), not a face.
MIN_SCORE = 0.8
MIN_SIDE = 0.03
SAME_FACE = 0.4  # overlap (intersection over the smaller box) above which two hits are one face


def overlap(a, b):
    ix = max(0.0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    return ix * iy / max(1e-9, min(a[2] * a[3], b[2] * b[3]))


def clears_floor(w, h, score, shorter):
    return score >= MIN_SCORE and min(w, h) >= MIN_SIDE * shorter


def merge(hits):
    """[(x, y, w, h, score)] -> the most confident of each group of overlapping hits"""
    kept = []
    for h in sorted(hits, key=lambda r: -r[4]):
        if all(overlap(h, k) < SAME_FACE for k in kept):
            kept.append(h)
    return kept


def find(img, model):
    H, W = img.shape[:2]
    det = cv2.FaceDetectorYN.create(model, "", (320, 320), SCORE, 0.3, 5000)
    hits = []
    for s in (1.0, 0.5, 0.25):
        im = img if s == 1.0 else cv2.resize(img, (round(W * s), round(H * s)), interpolation=cv2.INTER_AREA)
        det.setInputSize((im.shape[1], im.shape[0]))
        _, rows = det.detect(im)
        for r in [] if rows is None else rows:
            if r[14] >= SCORE and clears_floor(r[2] / s, r[3] / s, r[14], min(H, W)):
                hits.append((float(r[0] / s), float(r[1] / s), float(r[2] / s), float(r[3] / s), float(r[14])))
    return merge(hits)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--yunet", required=True)
    ap.add_argument("--json", required=True)
    a = ap.parse_args()
    img = cv2.imread(a.src, cv2.IMREAD_COLOR)
    if img is None:
        sys.exit(f"cannot read {a.src}")
    boxes = [{"x": round(x, 1), "y": round(y, 1), "w": round(w, 1), "h": round(h, 1), "score": round(s, 3)} for x, y, w, h, s in find(img, a.yunet)]
    with open(a.json, "w") as f:
        json.dump({"seen": len(boxes), "boxes": boxes}, f)


if __name__ == "__main__":
    main()
