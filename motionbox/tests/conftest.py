"""Shared fixtures: the spike folder (read-only, overridable with MOTIONBOX_SPIKE_DIR), the lift
MoveSpec in the plan's shape, and a Runner against the fake generator with a temp jobs dir.
"""
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # the motionbox project folder

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REPO_APP = Path(__file__).resolve().parents[2] / "app"   # the app folder of this worktree

from motionbox import config as config_mod  # noqa: E402
from motionbox import jobs  # noqa: E402
from motionbox.fake_generator import FakeGenerator  # noqa: E402

SPIKE = None
if os.environ.get("MOTIONBOX_SPIKE_DIR"):
    SPIKE = Path(os.environ["MOTIONBOX_SPIKE_DIR"])
else:
    _sibling = Path(__file__).resolve().parents[3] / "spike-kimodo-2026-10-25"
    if _sibling.is_dir():
        SPIKE = _sibling

needs_spike = pytest.mark.skipif(SPIKE is None, reason="spike folder not found; set MOTIONBOX_SPIKE_DIR")

LIFT_SENTENCE = ("A person stands still, then bends at the waist and reaches into a box in front of them "
                 "with both hands, slowly lifts out a flat frame, and holds it up in front of their face "
                 "to look at it against the light.")


@pytest.fixture(scope="session")
def spike():
    if SPIKE is None:
        pytest.skip("spike folder not found; set MOTIONBOX_SPIKE_DIR")
    return SPIKE


def lift_spec(spike_dir):
    """The lift MoveSpec, keys exactly as the spike's lift_hi_spec (rim 0.70 m, 0.36 m in front)."""
    hi = json.load(open(Path(spike_dir) / "constraints" / "lift_hi_spec.json"))
    return {"class": "takeOutHoldUp", "sentence": LIFT_SENTENCE, "seconds": 8.0,
            "keys": [{"frame": k["frame"], "hands": k["hands"], "pose": p, **({"base": k["base"], "base_t": k["base_t"]} if k.get("base") else {})}
                     for k, p in zip(hi["keys"], ["reach-low", "reach-low", "hold-high", "hold-high", "hold-high"])],
            "grab": 2.5, "release": 7.83, "hold": 0.0,
            "prop": {"pieceId": "hive", "kind": "container", "width": 0.48, "rimOrTop": 0.70, "front": 0.36}}


@pytest.fixture(scope="session")
def spec(spike):
    return lift_spec(spike)


@pytest.fixture()
def cfg(tmp_path, spike):
    return config_mod.load(spike_dir=spike, jobs_dir=tmp_path / "jobs", fake=True,
                           token="test-token", try_timeout=30.0, job_timeout=120.0)


@pytest.fixture()
def runner(cfg):
    return jobs.Runner(cfg, FakeGenerator(cfg))


def wait_for(predicate, timeout=60.0, interval=0.05):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        if predicate():
            return True
        time.sleep(interval)
    return False


def load_clip(spike, stem):
    for d in ("candidates", "chosen", "lower"):
        p = Path(spike) / d / (stem + ".npz")
        if p.exists():
            return np.load(p)
    raise FileNotFoundError(stem)
