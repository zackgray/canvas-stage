"""The empty set's control depth (draw-from-master plan 2.1 step A), free and local.

Takes the angle's control depth (the 8-bit near-bright depth image the draw is held to) and the take's ID pass at the same frame,
removes the performer from the depth by inpainting her pixels from their surroundings, and keeps every set piece as it is.
Ported from qa-2026-10-27-reference-draw/round2-plate-C/scripts/empty_depth.py, with the colours given by the caller
(the ID pass's own `hero` colour and each `prop:` colour) instead of thresholds.

  python empty_depth.py --depth <png> --id <png> --out <png> --hero R,G,B [--keep R,G,B ...] [--mask <png>]

Exit 0 = `--out` written (a copy of the depth when the performer is not in this frame). Needs OpenCV and numpy.
"""
import argparse
import sys

import cv2
import numpy as np


def colour(text):
    r, g, b = (int(x) for x in text.split(','))
    return r, g, b


def exact(ids, rgb, tol=2):
    return (np.abs(ids - np.array(rgb, dtype=np.int32)).max(axis=2) <= tol)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--depth', required=True)
    ap.add_argument('--id', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--hero', required=True, type=colour)
    ap.add_argument('--keep', action='append', default=[], type=colour)
    ap.add_argument('--mask')
    a = ap.parse_args()

    d = cv2.imread(a.depth, cv2.IMREAD_UNCHANGED)
    ids = cv2.imread(a.id)
    if d is None or ids is None:
        print('could not read the depth or the ID pass', file=sys.stderr)
        return 2
    ids = ids[:, :, ::-1].astype(np.int32)  # RGB
    if ids.shape[:2] != d.shape[:2]:
        ids = cv2.resize(ids.astype(np.uint8), (d.shape[1], d.shape[0]), interpolation=cv2.INTER_NEAREST).astype(np.int32)

    hero = exact(ids, a.hero)
    print('hero px', int(hero.sum()))
    hero = cv2.dilate(hero.astype(np.uint8) * 255, np.ones((15, 15), np.uint8))
    if a.mask:
        cv2.imwrite(a.mask, hero)
    if not (hero > 0).any():
        cv2.imwrite(a.out, d)
        return 0

    keep = np.zeros(hero.shape, dtype=bool)
    for rgb in a.keep:
        keep |= exact(ids, rgb)
    g = (d if d.ndim == 2 else d[..., 0]).astype(np.uint8)
    # fill the hero and the pieces from the real background only (so a piece's brightness does not smear behind her), then paste the pieces back
    union = ((hero > 0) | keep).astype(np.uint8) * 255
    union = cv2.dilate(union, np.ones((9, 9), np.uint8))
    out = cv2.inpaint(g, union, 25, cv2.INPAINT_TELEA)
    kept = cv2.erode(keep.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    out[kept] = g[kept]
    cv2.imwrite(a.out, out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
