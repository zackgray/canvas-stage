"""Constraint materialisation: a spec reproduces the spike's lift_hi constraints, and the
base-pose bank lands wrists on the asked targets."""
import json

import numpy as np
import pytest

from motionbox import constraints

from conftest import DATA_DIR, needs_spike


def _entry(entries, type_name):
    return next(e for e in entries if e["type"] == type_name)


@needs_spike
class TestMaterializeMatchesSpike:
    def test_same_entries_and_frames(self, spike, spec):
        resolver = constraints.ClipResolver(spike)
        entries, report = constraints.materialize(spec, resolver=resolver)
        spike_entries = json.load(open(spike / "constraints" / "lift_hi.json"))
        assert [e["type"] for e in entries] == [e["type"] for e in spike_entries]
        for mine, ref in zip(entries, spike_entries):
            assert mine["frame_indices"] == ref["frame_indices"]
            assert np.allclose(mine["local_joints_rot"], ref["local_joints_rot"], atol=1e-4)
            assert np.allclose(mine["root_positions"], ref["root_positions"], atol=1e-4)

    def test_wrists_land_on_the_asked_targets(self, spike, spec):
        _, report = constraints.materialize(spec, resolver=constraints.ClipResolver(spike))
        for row in report:
            for side in ("Left", "Right"):
                err = np.linalg.norm(np.array(row["got"][side]) - np.array(row["asked"][side]))
                assert err < 0.01, f"frame {row['frame']} {side}: {err:.3f} m off"


@needs_spike
class TestBasePoseBank:
    def test_bank_has_all_four_poses(self):
        bank = constraints.load_bank(DATA_DIR)
        assert set(bank) == {"reach-low", "hold-chest", "hold-high", "stand"}
        for pose in bank.values():
            assert pose["local"].shape == (77, 3, 3) and pose["root"].shape == (3,)

    def test_pose_only_keys_materialize(self, spike, spec):
        """Keys that name only a pose resolve through the shipped bank and still hit the targets."""
        bank = constraints.load_bank(DATA_DIR)
        bare = {"keys": [{"frame": k["frame"], "hands": k["hands"], "pose": k["pose"]} for k in spec["keys"]]}
        entries, report = constraints.materialize(bare, bank=bank)
        assert {e["type"] for e in entries} == {"left-hand", "right-hand"}
        for row in report:
            for side in ("Left", "Right"):
                err = np.linalg.norm(np.array(row["got"][side]) - np.array(row["asked"][side]))
                assert err < 0.01

    def test_unknown_pose_refused(self):
        with pytest.raises(ValueError):
            constraints.materialize({"keys": [{"frame": 0, "hands": {"Left": [0, 1, 0], "Right": [0.4, 1, 0]}, "pose": "fly"}]},
                                    bank=constraints.load_bank(DATA_DIR))
