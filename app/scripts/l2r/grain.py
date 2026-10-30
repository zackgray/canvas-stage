"""Layout-To-Render finish, step 2 (free, local). Copy of app/experiments/tune/grain.py with an fps argument: Gaussian noise,
0.6 px clump, fixed seed 88, scaled to STD levels (2.4 = the decided "standard"), added to every channel. Same frames and fps,
H.264 yuv420p crf 12.
  python grain.py <src.mp4> <out.mp4> [std=2.4] [fps=24]"""
import subprocess, sys
import cv2, numpy as np

if len(sys.argv) < 3: sys.exit(__doc__)
src, out = sys.argv[1], sys.argv[2]
std = float(sys.argv[3]) if len(sys.argv) > 3 else 2.4
fps = float(sys.argv[4]) if len(sys.argv) > 4 else 24
c = cv2.VideoCapture(src); rng = np.random.default_rng(88); p = None
while True:
    ok, f = c.read()
    if not ok: break
    n = cv2.GaussianBlur(rng.normal(0, 1, f.shape[:2]).astype(np.float32), (0, 0), 0.6); n *= std / (n.std() + 1e-6)
    g = np.clip(f.astype(np.float32) + n[..., None], 0, 255).astype(np.uint8)
    if p is None:
        h, w = g.shape[:2]
        p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", f"{fps:g}", "-i", "-",
                              "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", out], stdin=subprocess.PIPE)
    p.stdin.write(g.tobytes())
if p is None: sys.exit("no frames read from " + src)
p.stdin.close(); sys.exit(p.wait())
