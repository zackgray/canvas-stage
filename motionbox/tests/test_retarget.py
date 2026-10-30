"""Retarget: c15 with hand-IK matches the shipped lift BVH (the app's own CMU clip), checked with
the spike's BVH-reader semantics; the strip renderer produces a valid PNG."""
import numpy as np
import pytest

from motionbox import bvh, preview, retarget

from conftest import REPO_APP, load_clip, needs_spike

SHIP_LIFT = REPO_APP / "public" / "mocap" / "kimodo" / "lift_frame.bvh"


@needs_spike
class TestRetarget:
    def test_header_matches_35_01(self, spike, tmp_path):
        out = tmp_path / "out.bvh"
        retarget.retarget_npz(spike / "chosen" / "c15.npz", REPO_APP / "public" / "mocap" / "cmu" / "35_01.bvh", out, hand_ik=True)
        mine, canon = bvh.load(out), bvh.load(REPO_APP / "public" / "mocap" / "cmu" / "35_01.bvh")
        assert [j["name"] for j in mine["joints"]] == [j["name"] for j in canon["joints"]]
        assert all(np.allclose(a["offset"], b["offset"]) for a, b in zip(mine["joints"], canon["joints"]))
        assert mine["ft"] == pytest.approx(1 / 120, abs=1e-6)
        assert mine["frames"] == bvh.load(SHIP_LIFT)["frames"]

    def test_matches_shipped_lift_bvh(self, spike, tmp_path):
        out = tmp_path / "out.bvh"
        retarget.retarget_npz(spike / "chosen" / "c15.npz", REPO_APP / "public" / "mocap" / "cmu" / "35_01.bvh", out, hand_ik=True)
        mine, shipped = bvh.load(out), bvh.load(SHIP_LIFT)
        assert bvh.close_to(mine, shipped, atol=2e-3), "retargeted c15 diverged from the shipped lift BVH"
        # feet stay on the floor, hands hold the frame at head-relative height with a ~0.43 m grip
        assert mine["floor"] == pytest.approx(0.0, abs=0.02)
        lh, rh = mine["P"][:, mine["n"]["LeftHand"]], mine["P"][:, mine["n"]["RightHand"]]
        top = int(np.argmax((lh[:, 1] + rh[:, 1]) / 2))
        assert float(np.linalg.norm(lh[top] - rh[top])) == pytest.approx(0.43, abs=0.03)
        assert float((lh[top, 1] + rh[top, 1]) / 2 - mine["floor"]) == pytest.approx(1.46, abs=0.05)

    def test_without_hand_ik_differs(self, spike, tmp_path):
        hdr = REPO_APP / "public" / "mocap" / "cmu" / "35_01.bvh"
        a, b = tmp_path / "a.bvh", tmp_path / "b.bvh"
        retarget.retarget_npz(spike / "chosen" / "c15.npz", hdr, a, hand_ik=True)
        retarget.retarget_npz(spike / "chosen" / "c15.npz", hdr, b, hand_ik=False)
        pa, pb = bvh.load(a), bvh.load(b)
        assert not np.allclose(pa["P"], pb["P"], atol=1e-3)   # hand-IK visibly changes the arms


@needs_spike
class TestStrip:
    def test_png_written_and_valid(self, spike, tmp_path):
        out_bvh = tmp_path / "out.bvh"
        retarget.retarget_npz(spike / "chosen" / "c15.npz", REPO_APP / "public" / "mocap" / "cmu" / "35_01.bvh", out_bvh, hand_ik=True)
        png = preview.strip(out_bvh, tmp_path / "strip.png", prop=True)
        data = open(png, "rb").read()
        assert data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) > 5000
