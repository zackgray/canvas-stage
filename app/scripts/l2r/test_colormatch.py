"""Tests for colormatch.py. Run with your venv python (numpy + cv2 + ffmpeg on PATH):

    <venv>/Scripts/python -m unittest scripts/l2r/test_colormatch.py   (from app/)
"""
import importlib.util
import pathlib
import subprocess
import tempfile
import unittest

import cv2
import numpy as np

_spec = importlib.util.spec_from_file_location("colormatch", pathlib.Path(__file__).with_name("colormatch.py"))
cm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cm)


def scene(h=96, w=128, seed=1):
    rng = np.random.default_rng(seed)
    base = cv2.GaussianBlur(rng.uniform(40, 215, (h, w, 3)).astype(np.float32), (0, 0), 6)
    return base.astype(np.uint8)


def warm(img):
    f = img.astype(np.float32); f[..., 2] *= 1.25; f[..., 0] *= 0.7  # BGR: push red, cut blue
    return np.clip(f, 0, 255).astype(np.uint8)


def lab_stats(img):
    acc = cm.new_acc(); cm.accumulate(img, acc); return cm.stats(acc)


def write_clip(path, frames, fps=24):
    h, w = frames[0].shape[:2]
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
                          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", path], stdin=subprocess.PIPE)
    for f in frames: p.stdin.write(f.tobytes())
    p.stdin.close(); assert p.wait() == 0


class ColorMatch(unittest.TestCase):
    def setUp(self):
        self.d = pathlib.Path(tempfile.mkdtemp())
        self.master = scene(seed=1)
        self.raw = warm(scene(seed=2))
        cv2.imwrite(str(self.d / "master.png"), self.master); cv2.imwrite(str(self.d / "raw.png"), self.raw)

    def run_cm(self, *extra, src="raw.png", out="out.png"):
        return cm.main(["--target", str(self.d / "master.png"), "--in", str(self.d / src), "--out", str(self.d / out), *extra])

    def test_warm_raw_matches_master_stats_at_full_strength(self):
        self.assertEqual(self.run_cm("--strength", "1"), 0)
        (m1, s1), (m0, s0) = lab_stats(cv2.imread(str(self.d / "out.png"))), lab_stats(self.master)
        self.assertLess(np.abs(m1 - m0).max(), 1.5)
        self.assertLess(np.abs(s1 - s0).max(), 1.5)
        self.assertGreater(np.abs(lab_stats(self.raw)[0] - m0).max(), 5)  # the raw really was off

    def test_default_strength_lands_between(self):
        self.assertEqual(self.run_cm(), 0)
        m1 = lab_stats(cv2.imread(str(self.d / "out.png")))[0]; m0 = lab_stats(self.master)[0]; mr = lab_stats(self.raw)[0]
        err = np.abs(m1 - m0); self.assertTrue(np.all(err < np.abs(mr - m0)) and err.max() > 0.5)

    def test_strength_zero_is_noop(self):
        self.assertEqual(self.run_cm("--strength", "0"), 0)
        self.assertTrue(np.array_equal(cv2.imread(str(self.d / "out.png")), self.raw))

    def test_black_borders_are_excluded_from_stats(self):
        boxed = np.zeros((140, 128, 3), np.uint8); boxed[20:116] = self.raw
        self.assertLess(np.abs(lab_stats(boxed)[0] - lab_stats(self.raw)[0]).max(), 0.5)

    def test_bad_strength_and_missing_file_fail_with_nonzero(self):
        self.assertEqual(self.run_cm("--strength", "1.5"), 1)
        self.assertEqual(self.run_cm(src="nope.png"), 1)

    def test_clip_keeps_frame_count_fps_and_matches(self):
        frames = [np.roll(self.raw, i * 2, axis=1) for i in range(13)]
        write_clip(str(self.d / "raw.mp4"), frames, fps=24)
        self.assertEqual(self.run_cm("--strength", "1", src="raw.mp4", out="out.mp4"), 0)
        c = cv2.VideoCapture(str(self.d / "out.mp4"))
        self.assertEqual(int(c.get(cv2.CAP_PROP_FRAME_COUNT)), 13); self.assertAlmostEqual(c.get(cv2.CAP_PROP_FPS), 24, places=1)
        ok, f = c.read(); self.assertTrue(ok)
        self.assertLess(np.abs(lab_stats(f)[0] - lab_stats(self.master)[0]).max(), 3)


if __name__ == "__main__":
    unittest.main()
