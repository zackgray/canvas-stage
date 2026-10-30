"""Layout-To-Render grade / keyframe colour-match (free, local). Reinhard mean/std transfer in LAB toward a target still.
  python colormatch.py --target <png> --in <png|mp4> --out <png|mp4> [--strength 0.7] [--fps N]
still -> still or clip -> still, chosen by the --in extension (.mp4/.mov/.mkv/.webm/.avi = clip). Exit 0 = written, else stderr says why.
- strength 0..1 blends original -> fully matched in LAB (0 = no-op copy of the pixels; default 0.7, because 1.0 flattens drama).
- Stats come from pixels that are not near-black (max BGR channel >= 8), so letterbox / empty regions do not drag the mean down.
  The transfer is applied to every pixel. Per-channel std ratio is clamped to [0.5, 2] so a near-flat source cannot blow up.
- A clip uses ONE set of stats pooled over all its frames (pass 1), so there is no per-frame flicker; pass 2 streams frames through
  ffmpeg (one frame in RAM at a time). Frame count is preserved; fps = the input's (override with --fps). H.264 yuv420p crf 12.
- PNG output is lossless 8-bit."""
import argparse, subprocess, sys
import cv2, numpy as np

CLIPS = (".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v")
BLACK = 8
RATIO = (0.5, 2.0)


def lab(bgr):
    return cv2.cvtColor(bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)


def accumulate(bgr, acc):
    """acc = [n, sum[3], sumsq[3]] over non-black pixels (float64)."""
    m = bgr.max(axis=2) >= BLACK
    px = lab(bgr)[m].astype(np.float64)
    acc[0] += len(px); acc[1] += px.sum(0); acc[2] += (px ** 2).sum(0)


def stats(acc):
    if acc[0] < 16: raise ValueError("image is (almost) entirely black; nothing to take colour statistics from")
    mean = acc[1] / acc[0]
    return mean, np.sqrt(np.maximum(acc[2] / acc[0] - mean ** 2, 1e-6))


def new_acc(): return [0, np.zeros(3), np.zeros(3)]


def make_gain(src_stats, tgt_stats, strength):
    (sm, ss), (tm, ts) = src_stats, tgt_stats
    ratio = np.clip(ts / ss, *RATIO)
    return sm.astype(np.float32), ratio.astype(np.float32), tm.astype(np.float32), float(strength)


def apply(bgr, g):
    sm, ratio, tm, s = g
    if s <= 0: return bgr
    x = lab(bgr)
    y = (x - sm) * ratio + tm
    out = x + s * (y - x)
    out[..., 0] = np.clip(out[..., 0], 0, 100)
    return np.clip(cv2.cvtColor(out, cv2.COLOR_LAB2BGR) * 255.0 + 0.5, 0, 255).astype(np.uint8)


def read_image(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None: raise ValueError("cannot read image " + path)
    return img


def clip_stats(path):
    c = cv2.VideoCapture(path); acc = new_acc(); n = 0
    while True:
        ok, f = c.read()
        if not ok: break
        accumulate(f, acc); n += 1
    fps = c.get(cv2.CAP_PROP_FPS) or 24
    c.release()
    if n == 0: raise ValueError("no frames read from " + path)
    return stats(acc), fps, n


def match_clip(src, out, tgt_stats, strength, fps_override=None):
    s_stats, fps, n = clip_stats(src)
    fps = fps_override or fps
    g = make_gain(s_stats, tgt_stats, strength)
    c = cv2.VideoCapture(src); p = None; written = 0
    while True:
        ok, f = c.read()
        if not ok: break
        if p is None:
            h, w = f.shape[:2]
            p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", f"{fps:g}",
                                  "-i", "-", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", out],
                                 stdin=subprocess.PIPE)
        p.stdin.write(apply(f, g).tobytes()); written += 1
    c.release(); p.stdin.close()
    if p.wait() != 0: raise RuntimeError("ffmpeg failed")
    if written != n: raise RuntimeError(f"frame count changed: read {n}, wrote {written}")
    return written


def main(argv=None):
    ap = argparse.ArgumentParser(description="Reinhard LAB colour-match to a target still")
    ap.add_argument("--target", required=True); ap.add_argument("--in", dest="src", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--strength", type=float, default=0.7); ap.add_argument("--fps", type=float, default=None)
    a = ap.parse_args(argv)
    try:
        if not 0 <= a.strength <= 1: raise ValueError("--strength must be within 0..1")
        acc = new_acc(); accumulate(read_image(a.target), acc); t = stats(acc)
        if a.src.lower().endswith(CLIPS):
            match_clip(a.src, a.out, t, a.strength, a.fps)
        else:
            img = read_image(a.src); acc = new_acc(); accumulate(img, acc)
            if not cv2.imwrite(a.out, apply(img, make_gain(stats(acc), t, a.strength))): raise ValueError("cannot write " + a.out)
    except Exception as e:
        print("colormatch: " + str(e), file=sys.stderr); return 1
    return 0


if __name__ == "__main__": sys.exit(main())
