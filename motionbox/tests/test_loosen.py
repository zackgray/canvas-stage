"""The loosened filters for free words: soft checks become would_drop notes, a statue is still dropped, hand-target moves keep the old filters."""
import numpy as np

from motionbox import config as config_mod, score
from motionbox.soma import S77

I = S77.idx
FREE = {"class": "gesture", "sentence": "A person stands still, then does a cartwheel.", "seconds": 1.0, "keys": [], "phases": []}


def clip(drift=0.0, bend=0.0, start_low=False):
    """A 30-frame skeleton: hips at 0.9 m, the head at 1.6 m, feet on the floor; drift slides the hips, bend swings the right hand."""
    T = 30
    P = np.zeros((T, len(S77.names), 3))
    P[:, :, 1] = 0.5
    for n in ("LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot"):
        P[:, I[n], 1] = 0.0
    P[:, I["Hips"], 1] = 0.9
    P[:, I["Neck1"], 1] = 1.5
    P[:, 0, 0] = np.linspace(0, drift, T)
    P[:, I["RightHand"], 0] = np.linspace(0, bend, T)
    if start_low:
        P[0, I["Hips"], 1] = 0.3
    return P, np.zeros((T, 6), dtype=bool)


def test_drift_is_dropped_by_the_old_filters_and_noted_when_loosened():
    P, c = clip(drift=1.0)
    assert "travel" in score.analyze(P, c, FREE)["failed"]
    r = score.analyze(P, c, FREE, loosen=True)
    assert r["failed"] is None and r["would_drop"] == ["travel"]


def test_a_non_standing_start_survives_loosened_with_a_note():
    P, c = clip(bend=1.0, start_low=True)
    assert score.analyze(P, c, FREE)["failed"] == ["start"]
    r = score.analyze(P, c, FREE, loosen=True)
    assert r["failed"] is None and "start" in r["would_drop"]


def test_a_statue_is_still_dropped_when_loosened():
    P, c = clip()
    assert score.analyze(P, c, FREE, loosen=True)["failed"] == ["still"]


def test_hand_target_moves_keep_the_old_filters_even_when_loosened():
    P, c = clip(drift=1.0, bend=1.0)
    keyed = {**FREE, "keys": [{"frame": 5, "hands": {"Left": [0.2, 1, 0.3], "Right": [-0.2, 1, 0.3]}, "pose": "stand"}]}
    r = score.analyze(P, c, keyed, loosen=True)
    assert "travel" in r["failed"] and r["would_drop"] == []


def test_the_flag_defaults_on_and_turns_off_from_the_environment(monkeypatch):
    monkeypatch.delenv("MOTION_BOX_LOOSEN", raising=False)
    kw = dict(fake=True, token="t")
    assert config_mod.load(**kw).loosen is True
    monkeypatch.setenv("MOTION_BOX_LOOSEN", "0")
    assert config_mod.load(**kw).loosen is False
