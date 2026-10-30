"""Tests for the face pass's head track and window (face_track.py). No GPU, no network, no YuNet model, no video: synthetic depth and
ID frames, and a stand-in detector that answers where a perfect one would. Run with your venv python (numpy + cv2), from app/:

    <venv>/Scripts/python -m unittest scripts/l2r/test_face_track.py
"""
import importlib.util
import pathlib
import unittest

import cv2
import numpy as np

_spec = importlib.util.spec_from_file_location("face_track", pathlib.Path(__file__).with_name("face_track.py"))
ft = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ft)

H, W, N = 360, 640, 25
RED = [255, 0, 0]


def body(f):
    """a 20 x 120 px figure at 5 m that walks 2 px right a frame; a post at 3 m beside it; the wall at 20 m"""
    x0 = 200 + 2 * f
    return x0, 100, x0 + 20, 220


def depth(f):
    d = np.full((H, W), 20.0, np.float32)
    x0, y0, x1, y1 = body(f); d[y0:y1, x0:x1] = 5.0
    d[60:300, 120:140] = 3.0  # nearer, outside the band
    return d


def id_mask(f):
    m = np.zeros((H, W), bool); x0, y0, x1, y1 = body(f); m[y0:y1, x0:x1] = True
    return m


def face_at(f, dx=3.0):
    """where the render's face is: 3 px right of the clay's head (the still nudged the person), 12 px tall"""
    x0, y0, x1, _ = body(f)
    return ((x0 + x1) / 2 + dx, y0 + 8.0, 10.0, 12.0)


def stub(miss=()):
    calls = []
    def detect(im, box):
        f = len(calls); calls.append(box)
        if f in miss: return None
        cx, cy, w, h = face_at(f)
        return (cx - w / 2, cy - h / 2, w, h, 0.93)
    return detect, calls


def raw():
    return (np.zeros((H, W, 3), np.uint8) for _ in range(N))


def keys():
    return ft.keys_from({f: id_mask(f) for f in (0, 12, 24)}, {f: depth(f) for f in (0, 12, 24)})


class TrackTest(unittest.TestCase):
    def test_follows_the_render_face_not_the_clay(self):
        detect, calls = stub()
        rows, s = ft.track_rows(raw(), [depth(f) for f in range(N)], keys(), detect, N)
        self.assertTrue(s['ok']); self.assertEqual(s['hits'], N)
        for f in (0, 10, 24):
            self.assertAlmostEqual(rows[f]['face'][0], face_at(f)[0], delta=0.6)  # smoothing over a straight walk keeps the line
            self.assertAlmostEqual(rows[f]['clayHead'][0], (body(f)[0] + body(f)[2] - 1) / 2, delta=0.6)  # the clay head, from depth
        # the detector was asked around the clay's head, never the post at 3 m
        x0, y0, x1, y1 = calls[5]
        self.assertLess(x0, face_at(5)[0]); self.assertGreater(x1, face_at(5)[0]); self.assertGreater(x0, 140)

    def test_a_few_dropped_frames_are_filled(self):
        detect, _ = stub(miss={7})
        rows, s = ft.track_rows(raw(), [depth(f) for f in range(N)], keys(), detect, N)
        self.assertTrue(s['ok']); self.assertIsNone(rows[7]['yunet'])
        self.assertAlmostEqual(rows[7]['face'][0], face_at(7)[0], delta=0.6)

    def test_fails_loudly_when_the_detector_loses_the_face(self):
        detect, _ = stub(miss=set(range(0, N, 3)))
        rows, s = ft.track_rows(raw(), [depth(f) for f in range(N)], keys(), detect, N)
        self.assertFalse(s['ok']); self.assertIn('found on only', s['why'])
        self.assertNotIn('face', rows[0])

    def test_a_short_render_is_refused(self):
        detect, _ = stub()
        with self.assertRaises(SystemExit):
            ft.track_rows((np.zeros((H, W, 3), np.uint8) for _ in range(N - 2)), [depth(f) for f in range(N)], keys(), detect, N)

    def test_a_person_the_id_pass_never_shows_is_refused(self):
        with self.assertRaises(SystemExit):
            ft.keys_from({0: np.zeros((H, W), bool)}, {0: depth(0)})

    def test_person_mask_reads_the_id_colour(self):
        im = np.zeros((4, 4, 3), np.uint8); im[1, 1] = (0, 0, 255)  # BGR red
        self.assertEqual(int(ft.person_mask(im, RED).sum()), 1)


class SmoothTest(unittest.TestCase):
    def test_a_steady_walk_stays_straight_to_the_ends(self):
        v = 200 + 2.0 * np.arange(N)
        self.assertLess(float(np.abs(ft.smooth(v, 2.0) - v).max()), 1e-6)

    def test_jitter_is_smoothed(self):
        v = np.where(np.arange(N) % 2, 1.0, -1.0)
        self.assertLess(float(np.abs(ft.smooth(v, 2.0)[3:-3]).max()), 0.2)


class WindowTest(unittest.TestCase):
    def test_size_is_four_faces_and_fits_the_largest(self):
        self.assertEqual(ft.window_size(50, 60), 200)  # E143: a ~50 px face, a 200 px window
        self.assertEqual(ft.window_size(50, 150), 270)  # the face grows: the window keeps hat and collar in
        self.assertEqual(ft.window_size(10, 12), ft.WIN_MIN)
        self.assertEqual(ft.window_size(400, 400), ft.WIN_MAX)

    def test_crop_puts_the_face_where_the_box_says(self):
        im = np.zeros((H, W, 3), np.uint8); cv2.circle(im, (300, 150), 4, (255, 255, 255), -1)
        rows = [dict(face=[300.0, 150.0, 10.0, 12.0])]
        (bx, by), = ft.win_boxes(rows, 100)
        c = ft.crop(im, bx, by, 100)
        ys, xs = np.where(c[..., 0] > 128)
        self.assertAlmostEqual(xs.mean(), ft.WIN_OUT / 2, delta=3); self.assertAlmostEqual(ys.mean(), ft.FACE_Y * ft.WIN_OUT, delta=3)

    def test_klein_mask_is_the_face_only(self):
        face = [300.0, 150.0, 10.0, 12.0]; (bx, by), = ft.win_boxes([dict(face=face)], 100)
        m = ft.face_mask_win(face, (bx, by), 100)
        s = ft.WIN_OUT / 100
        self.assertEqual(m[int(ft.FACE_Y * ft.WIN_OUT + 0.08 * 12 * s), ft.WIN_OUT // 2], 255)
        self.assertLess((m > 0).mean(), 0.02)  # a small ellipse, not the window

    def test_strip_has_one_cell_per_frame(self):
        rows = [dict(face=[300.0, 150.0, 10.0, 12.0])] * 3
        st = ft.strip_of({0: np.zeros((H, W, 3), np.uint8), 2: np.zeros((H, W, 3), np.uint8)}, rows, [0, 2], cell=64)
        self.assertEqual(st.shape, (64, 128, 3))


if __name__ == "__main__":
    unittest.main()
