"""Draw from the approved master, arm 2: the master picture seen from the take's camera, by its depth (free, local).

The master still + its 16-bit planar zdepth (master-zdepth.png, 0.01 m units, 0 = sky) + the master camera -> the same picture
from the take's camera: a z-buffered point splat. Each source pixel is lifted to the world, moved to the take camera and
splatted as a k x k square, k growing with how much closer the camera is (a pixel covers z/zn times its own width), so a push-in
does not tear. Cracks under 3 px are filled from their neighbours; the real holes (what the master never saw) are black and
written as a mask, dilated by 1 px so no half-coloured seam is left at their edge. The master is an empty place (nobody is in
it), so there is no performer to mask out of it; the take's ID pass is not read here.

  project_master.py --master M.png --zdepth Z.png --master-cam CAM --take-cam CAM --out OUT.png [--holes H.png]
CAM = px,py,pz,tx,ty,tz,focalMm (look-at) or px,py,pz,qx,qy,qz,qw,focalMm (three.js quaternion); 36 mm-wide gate.
Exit 0 = written; prints `holes N.N%`.
"""
import argparse
import sys

import cv2
import numpy as np

GATE_MM = 36.0
MAX_SPLAT = 4


def cam_pose(text):
    """-> (position, rows of the world->camera rotation (x right, y up, z back), focal mm)"""
    v = [float(x) for x in text.split(',')]
    pos = np.array(v[:3], float)
    if len(v) == 7:
        f = np.array(v[3:6], float) - pos
        f /= np.linalg.norm(f)
        r = np.cross(f, [0, 1, 0])
        r /= np.linalg.norm(r)
        return pos, np.stack([r, np.cross(r, f), -f]), v[6]
    if len(v) == 8:
        x, y, z, w = v[3:7]
        n = np.sqrt(x * x + y * y + z * z + w * w)
        x, y, z, w = x / n, y / n, z / n, w / n
        cw = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                       [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                       [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])  # camera -> world
        return pos, cw.T, v[7]
    raise ValueError('a camera is 7 (look-at) or 8 (quaternion) numbers')


def focal_px(mm, w):
    return mm / GATE_MM * w


def project(img, z, master, take):
    h, w = z.shape
    p0, r0, mm0 = master
    p1, r1, mm1 = take
    f0, f1 = focal_px(mm0, w), focal_px(mm1, w)
    cx, cy = w / 2, h / 2
    z = np.where(z <= 0, 5000.0, z)  # sky / nothing drawn: far away
    v, u = np.mgrid[0:h, 0:w].astype(np.float64)
    pc = np.stack([(u + 0.5 - cx) / f0 * z, -(v + 0.5 - cy) / f0 * z, -z], -1).reshape(-1, 3)
    pn = ((pc @ r0 + p0) - p1) @ r1.T  # master camera -> world -> take camera
    zn = -pn[:, 2]
    ok = zn > 0.05
    zs = np.maximum(zn, 1e-3)
    un, vn = pn[:, 0] / zs * f1 + cx, -pn[:, 1] / zs * f1 + cy
    z = z.reshape(-1)
    # one source pixel is z/f0 m wide; in the new view that is (z/f0)*f1/zn px
    size = np.clip(np.ceil(z / zs * f1 / f0 - 0.2), 1, MAX_SPLAT).astype(int)
    col = img.reshape(-1, 3)
    out = np.zeros((h, w, 3), np.uint8)
    zbuf = np.full((h, w), np.inf)
    order = np.argsort(-zn)  # far first, so the nearest write is the last
    for k in range(1, MAX_SPLAT + 1):
        sel = order[ok[order] & (size[order] == k)]
        for dy in range(k):
            for dx in range(k):
                x = np.floor(un[sel]).astype(int) + dx - k // 2
                y = np.floor(vn[sel]).astype(int) + dy - k // 2
                m = (x >= 0) & (x < w) & (y >= 0) & (y < h)
                s, x, y = sel[m], x[m], y[m]
                vis = zn[s] <= zbuf[y, x] + 1e-4
                s, x, y = s[vis], x[vis], y[vis]
                zbuf[y, x] = zn[s]
                out[y, x] = col[s]
    hole = np.isinf(zbuf)
    blobs = cv2.morphologyEx(hole.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0  # only blobs >= 3x3 are real
    crack = hole & ~blobs
    if crack.any():
        out = np.where(crack[..., None], cv2.inpaint(out, crack.astype(np.uint8) * 255, 2, cv2.INPAINT_TELEA), out)
    hole = cv2.dilate(blobs.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    out[hole] = 0
    return out, hole


def main():
    ap = argparse.ArgumentParser()
    for a in ('master', 'zdepth', 'master-cam', 'take-cam', 'out'):
        ap.add_argument('--' + a, required=True)
    ap.add_argument('--holes')
    ap.add_argument('--unit', type=float, default=0.01)
    a = ap.parse_args()
    img = cv2.imread(a.master)
    zraw = cv2.imread(a.zdepth, cv2.IMREAD_UNCHANGED)
    if img is None or zraw is None:
        print('could not read the master or its depth', file=sys.stderr)
        return 2
    if zraw.ndim == 3:
        zraw = zraw[..., 0]
    z = zraw.astype(np.float64) * a.unit
    if z.shape != img.shape[:2]:
        z = cv2.resize(z, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
    out, hole = project(img, z, cam_pose(a.master_cam), cam_pose(a.take_cam))
    cv2.imwrite(a.out, out)
    cv2.imwrite(a.holes or a.out.replace('.png', '-holes.png'), hole.astype(np.uint8) * 255)
    print('holes %.1f%%' % (100 * hole.mean()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
