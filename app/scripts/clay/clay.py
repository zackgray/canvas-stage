"""Clay layout video of a locked take (free, local): the server-callable form of experiments/e102_clay.py (E96 clay, face sculpted).

Input folder (server/clay writes it from the browser's capture, e96_export.ts's passes at 1920x1088):
  colour_NNN.png  the world + performer render (holes magenta)        (color_NNN.png, E96's spelling, is read too)
  depth_NNN.f32   planar depth, everything (Float32, top row first; 0 = nothing drawn)
  bg_NNN.f32      planar depth with the performer hidden
  cameras.json    {width, height, frames: [{vfovDeg, ...}, ...]}
Output: an H.264 yuv420p mp4 at 24 fps, one clay frame per input frame (+ <out>-f0/-mid/-last.png with --stills).
Progress: one "frame k/N" line per frame on stdout, then "done <out>".

  python scripts/clay/clay.py --in <frames dir> --out <clay.mp4> [--key 0.75,0.25,0.62]
         [--faces faces.json | --yunet <face_detection_yunet_2023mar.onnx> | --no-face] [--stills]"""
import argparse
import json
import os
import subprocess
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import faces as F  # noqa: E402
from shade import DEFAULT_KEY, shade, unit  # noqa: E402


def frame_files(d, k):
    n = f"{k:03d}"
    col = os.path.join(d, f"colour_{n}.png")
    if not os.path.exists(col):
        col = os.path.join(d, f"color_{n}.png")
    return col, os.path.join(d, f"depth_{n}.f32"), os.path.join(d, f"bg_{n}.f32")


def read(d, k, W, H):
    col_p, d_p, b_p = frame_files(d, k)
    for p in (col_p, d_p, b_p):
        if not os.path.exists(p):
            raise FileNotFoundError(f"frame {k}: {os.path.basename(p)} is missing")
    col = cv2.imread(col_p)
    if col is None or col.shape[:2] != (H, W):
        raise ValueError(f"frame {k}: colour is not {W}x{H}")
    D = np.fromfile(d_p, np.float32)
    B = np.fromfile(b_p, np.float32)
    if D.size != W * H or B.size != W * H:
        raise ValueError(f"frame {k}: depth is not {W}x{H} Float32")
    return col, D.reshape(H, W), B.reshape(H, W)


def person_of(D, B):
    return (D > 0) & ((B <= 0) | (D < B - 1e-3))


def encoder(out, W, H):
    ff = os.environ.get("FFMPEG", "ffmpeg")
    return subprocess.Popen([ff, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", "24", "-i", "-",
                             "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
                             "-f", "mp4", out], stdin=subprocess.PIPE)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--key", default=",".join(map(str, DEFAULT_KEY)), help="key light direction, camera space (x right, y up, z to the viewer)")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--faces", help="faces.json: per-frame [cx, cy, rx, ry] px or null")
    g.add_argument("--yunet", help="YuNet onnx: find the face on each colour frame")
    g.add_argument("--no-face", action="store_true", help="no face sculpt")
    ap.add_argument("--stills", action="store_true", help="also write <out>-f0 / -mid / -last .png")
    a = ap.parse_args(argv)

    cams = json.load(open(os.path.join(a.src, "cameras.json")))
    W, H, frames = int(cams["width"]), int(cams["height"]), cams["frames"]
    N = len(frames)
    if N < 1:
        raise ValueError("cameras.json has no frames")
    key = unit([float(x) for x in a.key.split(",")])

    if a.faces:
        ell = F.load(a.faces, N)
    elif a.yunet:
        if not os.path.exists(a.yunet):
            raise FileNotFoundError(f"YuNet model {a.yunet} is missing")
        det = F.YuNet(a.yunet)
        hits = []
        for k in range(N):
            col, D, B = read(a.src, k, W, H)
            hits.append(det.find(col, person_of(D, B)))
            print(f"face {k + 1}/{N}", flush=True)
        ell = F.track(hits)
        print(f"faces found on {sum(h is not None for h in hits)}/{N} frames", flush=True)
    else:
        ell = [None] * N

    tmp = a.out + ".part"
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    enc = encoder(tmp, W, H)
    keep = {0: "f0", N // 2: "mid", N - 1: "last"} if a.stills else {}
    try:
        for k, f in enumerate(frames):
            col, D, B = read(a.src, k, W, H)
            fy = H / 2 / np.tan(np.radians(float(f["vfovDeg"])) / 2)
            g8, share = shade(col, D, B, fy, ell[k], key)
            bgr = np.repeat(g8[..., None], 3, 2)
            enc.stdin.write(np.ascontiguousarray(bgr).tobytes())
            if k in keep:
                cv2.imwrite(f"{os.path.splitext(a.out)[0]}-{keep[k]}.png", bgr)
            print(f"frame {k + 1}/{N}" + (f" person {share:.3f}" if k % 24 == 0 else ""), flush=True)
        enc.stdin.close()
        if enc.wait() != 0:
            raise RuntimeError(f"ffmpeg failed (exit {enc.returncode})")
    except BaseException:
        enc.kill()
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    os.replace(tmp, a.out)
    print(f"done {a.out}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # one readable line for the server's log
        print(f"error: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
