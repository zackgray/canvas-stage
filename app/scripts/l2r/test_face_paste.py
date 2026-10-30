"""Tests for the face pass's paste-back (face_paste.py). No GPU, no network, no video: synthetic frames. Run from app/:

    <venv>/Scripts/python -m unittest scripts/l2r/test_face_paste.py
"""
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

import cv2
import numpy as np

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
_spec = importlib.util.spec_from_file_location("face_paste", pathlib.Path(__file__).with_name("face_paste.py"))
fp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fp)
from face_track import WIN_OUT, crop  # noqa: E402

H, W, WIN = 360, 640, 100
FACE = [300.0, 150.0, 20.0, 24.0]
BOX = (FACE[0] - WIN / 2, FACE[1] - 0.4 * WIN)


def texture(seed=1):
    rng = np.random.default_rng(seed)
    im = cv2.GaussianBlur(rng.integers(0, 255, (H, W, 3)).astype(np.uint8), (0, 0), 1.5)
    return cv2.normalize(im, None, 30, 220, cv2.NORM_MINMAX)


class AlignTest(unittest.TestCase):
    def test_recovers_the_window_renders_shift_on_the_head_ring(self):
        raw_win = crop(texture(), *BOX, WIN)
        moved = cv2.warpAffine(raw_win, np.float32([[1, 0, 6], [0, 1, -4]]), (WIN_OUT, WIN_OUT), borderMode=cv2.BORDER_REPLICATE)
        fw = fp.face_in_win(FACE, BOX, WIN)
        cx, cy = int(fw[0]), int(fw[1])
        cv2.ellipse(moved, (cx, cy), (int(0.5 * fw[2]), int(0.5 * fw[3])), 0, 0, 360, (250, 250, 250), -1)  # a new face: must not count
        dx, dy, cc = fp.shift_of(raw_win, moved, fw)
        self.assertAlmostEqual(dx, 6, delta=0.5); self.assertAlmostEqual(dy, -4, delta=0.5); self.assertGreater(cc, 0.9)


class PasteTest(unittest.TestCase):
    def setUp(self):
        self.raw = texture()
        nw = crop(self.raw, *BOX, WIN)
        fw = fp.face_in_win(FACE, BOX, WIN)
        cv2.ellipse(nw, (int(fw[0]), int(fw[1] + 0.08 * fw[3])), (int(0.5 * fw[2]), int(0.5 * fw[3])), 0, 0, 360, (40, 200, 240), -1)
        self.nw = nw

    def test_only_the_face_ellipse_changes(self):
        (x0, y0, x1, y1), oo, ln, m, core = fp.prep(self.raw, self.nw, BOX, FACE, (0.0, 0.0), WIN)
        out = self.raw.copy(); out[y0:y1, x0:x1] = fp.blend(oo, ln, m, core, np.zeros(3), np.random.default_rng(0))
        diff = np.abs(out.astype(int) - self.raw.astype(int)).sum(-1)
        far = fp.ellipse((H, W), FACE[0], FACE[1], FACE[2], FACE[3], grow=1.6) == 0
        self.assertEqual(int(diff[far].max()), 0)  # hat, collar, the rest of the frame: the raw's own pixels
        self.assertGreater(float(diff[int(FACE[1]), int(FACE[0])]), 60)  # the face is the new one

    def test_colour_shift_matches_the_raw_mean_in_the_face(self):
        _, oo, ln, m, core = fp.prep(self.raw, self.nw, BOX, FACE, (0.0, 0.0), WIN)
        d = fp.lab_delta(oo, ln, core)
        res = fp.blend(oo, ln, m, core, d, np.random.default_rng(0))
        got = cv2.cvtColor(res.astype(np.float32) / 255, cv2.COLOR_BGR2LAB)[core].mean(0)
        want = cv2.cvtColor(oo / 255, cv2.COLOR_BGR2LAB)[core].mean(0)
        self.assertLess(float(np.abs(got - want).max()), 4.0)
        raw_new = cv2.cvtColor(fp.blend(oo, ln, m, core, np.zeros(3), np.random.default_rng(0)).astype(np.float32) / 255, cv2.COLOR_BGR2LAB)[core].mean(0)
        self.assertGreater(float(np.abs(raw_new - want).max()), 15.0)  # without the match the new face is far off

    def test_an_empty_face_core_shifts_nothing(self):
        self.assertTrue(np.all(fp.lab_delta(np.zeros((4, 4, 3), np.float32), np.zeros((4, 4, 3), np.float32), np.zeros((4, 4), bool)) == 0))


class CropTest(unittest.TestCase):
    def test_native_crop_is_the_window_at_its_own_pixels_even_at_the_edge(self):
        im = texture()
        c = fp.native(im, (BOX[0], BOX[1]), WIN)
        self.assertEqual(c.shape, (WIN, WIN, 3))
        self.assertTrue(np.array_equal(c, im[int(round(BOX[1])):int(round(BOX[1])) + WIN, int(round(BOX[0])):int(round(BOX[0])) + WIN]))
        self.assertEqual(fp.native(im, (-30.0, -30.0), WIN).shape, (WIN, WIN, 3))

    def test_crops_put_frame_zero_beside_the_largest(self):
        im = texture()
        self.assertEqual(fp.crops_of({0: im, 5: im}, [0, 5], [BOX] * 6, WIN).shape, (WIN, 2 * WIN, 3))


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is not on PATH")
class CliTest(unittest.TestCase):
    """window -> (a stand-in window render: the raw window with a new face) -> paste -> crops, through the files the server reads"""
    def test_the_free_steps_end_to_end(self):
        import face_track as ft
        n, d = 9, tempfile.mkdtemp()
        raw = [np.roll(texture(), 2 * f, axis=1) for f in range(n)]
        ft.encode(raw, os.path.join(d, "raw.mp4"), W, H)
        cv2.imwrite(os.path.join(d, "still.png"), cv2.resize(raw[0], (1920, 1088)))
        rows = [dict(f=f, face=[FACE[0] + 2 * f, FACE[1], FACE[2], FACE[3] + 0.5 * f]) for f in range(n)]  # walking closer
        json.dump(dict(summary=dict(ok=True, frames=n), rows=rows), open(os.path.join(d, "track.json"), "w"))
        plan = dict(raw=os.path.join(d, "raw.mp4"), still=os.path.join(d, "still.png"), out=d, dir=d, win=os.path.join(d, "win.mp4"),
                    afterRaw=os.path.join(d, "after-raw.mp4"), before=os.path.join(d, "raw.mp4"), after=os.path.join(d, "after-raw.mp4"),
                    beforeCrop=os.path.join(d, "b.png"), afterCrop=os.path.join(d, "a.png"))
        json.dump(plan, open(os.path.join(d, "plan.json"), "w"))
        run = lambda script, cmd: subprocess.check_call([sys.executable, str(HERE / script), cmd, os.path.join(d, "plan.json")], stdout=subprocess.DEVNULL)
        run("face_track.py", "window")
        win = json.load(open(os.path.join(d, "window.json")))["win"]
        new = []
        for im in ft.frames_of(os.path.join(d, "win-raw.mp4")):
            cv2.circle(im, (WIN_OUT // 2, int(0.4 * WIN_OUT)), int(0.2 * WIN_OUT * 20 / win), (40, 200, 240), -1); new.append(im)
        ft.encode(new, os.path.join(d, "win.mp4"), WIN_OUT, WIN_OUT)
        run("face_paste.py", "paste")
        after, before = list(ft.frames_of(os.path.join(d, "after-raw.mp4"))), list(ft.frames_of(os.path.join(d, "raw.mp4")))
        self.assertEqual(len(after), n)
        diff = lambda ys, xs: float(np.abs(after[4][ys, xs].astype(int) - before[4][ys, xs].astype(int)).mean())
        fx, fy = int(FACE[0] + 8), int(FACE[1])
        self.assertLess(diff(slice(0, 60), slice(0, 60)), 4.0)  # far from the face: the raw, re-encoded
        self.assertGreater(diff(slice(fy - 3, fy + 3), slice(fx - 3, fx + 3)), 40.0)  # the face: the window render's
        run("face_paste.py", "crops")
        self.assertEqual(cv2.imread(os.path.join(d, "a.png")).shape, (win, 2 * win, 3))  # frame 0 beside the largest (here the last)
        self.assertEqual(cv2.imread(os.path.join(d, "b.png")).shape, (win, 2 * win, 3))

if __name__ == "__main__":
    unittest.main()
