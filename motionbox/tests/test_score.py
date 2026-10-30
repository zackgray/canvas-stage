"""Scoring: reproduces the spike's recorded metrics for c15 and hard-drops the stooped tries c03/c04."""
import pytest

from motionbox import score

from conftest import load_clip, needs_spike


def analyze(spike, spec, stem):
    z = load_clip(spike, stem)
    return score.analyze(z["posed_joints"], z["foot_contacts"].astype(bool), spec)


@needs_spike
class TestMetrics:
    def test_c15_grip_matches_prop_metrics(self, spike, spec):
        """The spike measured c15's grip over [2.5, 7.83] s: mean 0.439 m +- 0.018 m."""
        r = analyze(spike, spec, "c15")
        m = r["metrics"]
        assert r["failed"] is None, f"c15 should survive all hard filters: {r['failed']}"
        assert m["grip_mean_m"] == pytest.approx(0.439, abs=0.005)
        assert m["grip_std_m"] == pytest.approx(0.018, abs=0.004)
        assert m["grip_asked_m"] == pytest.approx(0.42, abs=0.01)

    def test_c15_slide_is_about_1cm_per_s(self, spike, spec):
        m = analyze(spike, spec, "c15")["metrics"]
        assert m["slide_cms"] == pytest.approx(0.66, abs=0.2)
        assert m["slide_cms"] < 1.5  # "about 1 cm/s"; walking runs are 3-6

    def test_c15_starts_standing_and_holds_to_the_end(self, spike, spec):
        m = analyze(spike, spec, "c15")["metrics"]
        assert m["start_hip_ratio"] > 0.92 and m["start_tilt_deg"] < 15
        assert m["end_err_m"] < 0.08       # no sag after the last key
        assert m["keys_err_m"] < 0.08      # hands hit every key
        assert m["through_frames"] <= 6    # hands stay out of the hive walls
        assert m["root_travel_m"] <= 0.25

    def test_c15_frames_match_asked_seconds(self, spike, spec):
        m = analyze(spike, spec, "c15")["metrics"]
        assert m["frames"] == 240


@needs_spike
class TestHardFilters:
    def test_c03_dropped_stooped(self, spike, spec):
        r = analyze(spike, spec, "c03")
        assert r["failed"] is not None
        assert "start" in r["failed"]                    # frame-0 torso tilt ~33 deg
        assert score.dropped_reason(r["failed"]) == "the start wasn't standing"

    def test_c04_dropped_stooped(self, spike, spec):
        r = analyze(spike, spec, "c04")
        assert r["failed"] is not None
        assert "start" in r["failed"]

    def test_reason_is_plain_words(self, spike, spec):
        r = analyze(spike, spec, "c03")
        reason = score.dropped_reason(r["failed"])
        for banned in ("kimodo", "constraint", "seed", "candidate", "bvh", "bible"):
            assert banned not in reason.lower()


@needs_spike
class TestRank:
    def test_survivors_get_distinct_ranks_and_reasons(self, spike, spec):
        tries = []
        for stem in ("c13", "c14", "c15"):   # the three lift_hi-keyed candidates from the spike
            r = analyze(spike, spec, stem)
            assert r["failed"] is None, f"{stem} unexpectedly failed: {r['failed']}"
            tries.append({"metrics": r["metrics"]})
        score.rank(tries)
        assert sorted(t["rank"] for t in tries) == [1, 2, 3]
        assert all(isinstance(t["reason"], str) and t["reason"] for t in tries)
        # the steadiest grip is recognised as such
        steadiest = min(tries, key=lambda t: t["metrics"]["grip_std_m"])
        assert steadiest["reason"] == "steadiest hands"

    def test_single_survivor_still_gets_a_reason(self):
        (t,) = score.rank([{"metrics": {"grip_std_m": 0.01, "slide_cms": 1.0}}])
        assert t["rank"] == 1 and t["reason"]
