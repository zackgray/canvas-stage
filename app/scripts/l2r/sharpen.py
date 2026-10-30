"""Layout-To-Render finish, step 1 (free, local). Copy of app/experiments/e103_baseline.py with arguments: luma-only local
contrast + unsharp mask, halo-limited. Local contrast: +LC of (Y - blur(Y, LC_SIGMA px)). Unsharp: +US of (Y - blur(Y, US_SIGMA
px)), then the overshoot is clamped to the local 5x5 min/max +-CLAMP levels (no halos). Chroma untouched. Same frames and fps,
H.264 yuv420p crf 12 (grain.py re-encodes after it).
  python sharpen.py <src.mp4> <out.mp4> [fps=24] [lc=0.25] [us=0.8] [lc_sigma=28] [us_sigma=1.1] [clamp=6]"""
import subprocess, sys
import cv2, numpy as np

if len(sys.argv) < 3: sys.exit(__doc__)
src, out = sys.argv[1], sys.argv[2]
fps, LC, US, LC_SIGMA, US_SIGMA, CLAMP = ([float(a) for a in sys.argv[3:9]] + [24, 0.25, 0.8, 28, 1.1, 6][len(sys.argv[3:9]):])
c = cv2.VideoCapture(src); p = None; K = np.ones((5, 5), np.uint8)
while True:
    ok, f = c.read()
    if not ok: break
    ycc = cv2.cvtColor(f, cv2.COLOR_BGR2YCrCb); y = ycc[..., 0].astype(np.float32)
    lc = y + LC * (y - cv2.GaussianBlur(y, (0, 0), LC_SIGMA))
    us = lc + US * (lc - cv2.GaussianBlur(lc, (0, 0), US_SIGMA))
    lo, hi = cv2.erode(y, K), cv2.dilate(y, K)
    us = np.clip(us, lo - CLAMP, hi + CLAMP)
    ycc[..., 0] = np.clip(us, 0, 255).astype(np.uint8)
    g = cv2.cvtColor(ycc, cv2.COLOR_YCrCb2BGR)
    if p is None:
        h, w = g.shape[:2]
        p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", f"{fps:g}", "-i", "-",
                              "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", out], stdin=subprocess.PIPE)
    p.stdin.write(g.tobytes())
if p is None: sys.exit("no frames read from " + src)
p.stdin.close(); sys.exit(p.wait())
