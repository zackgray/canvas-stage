"""The job state machine against the fake generator: a full run, busy/queue of 1, cancel, timeout."""
import time

import pytest

from motionbox import jobs
from motionbox.fake_generator import FakeGenerator

from conftest import needs_spike, wait_for


class SlowGen(FakeGenerator):
    def __init__(self, cfg, delay):
        super().__init__(cfg)
        self.delay = delay

    def generate(self, **kw):
        time.sleep(self.delay)
        return super().generate(**kw)


@needs_spike
class TestFullRun:
    def test_job_completes_with_top3_files(self, runner, cfg, spec):
        job = runner.submit(spec, n=8)
        assert wait_for(lambda: runner.status(job.id)["stage"] == "done", timeout=120)
        st = runner.status(job.id)
        assert st["done"] == 8 and st["round"] == 1
        assert 1 <= len(st["tries"]) <= 3
        assert all(t["rank"] in (1, 2, 3) and t["reason"] for t in st["tries"])
        assert st["tries"] == sorted(st["tries"], key=lambda t: t["rank"])
        for t in st["tries"]:
            folder = cfg.jobs_dir / job.id
            for ext in (".bvh", ".png", ".json"):
                assert (folder / (t["id"] + ext)).is_file(), f"missing {t['id']}{ext}"
        # contract keys
        for key in ("id", "stage", "done", "of", "round", "tries", "dropped"):
            assert key in st
        # every try is reproducible: same seeds give the same job inputs
        job2 = runner.submit(spec, n=4, seeds=[1, 2, 3, 4])
        assert job2.seeds == [1, 2, 3, 4]
        assert wait_for(lambda: runner.status(job2.id)["stage"] == "done", timeout=120)

    def test_finished_job_status_comes_from_disk(self, runner, cfg, spec):
        job = runner.submit(spec, n=2)
        assert wait_for(lambda: (cfg.jobs_dir / job.id / "job.json").exists(), timeout=120)
        fresh = jobs.Runner(cfg, FakeGenerator(cfg))   # no in-memory record
        st = fresh.status(job.id)
        assert st["stage"] == "done" and st["tries"]


@needs_spike
class TestBusyQueueCancel:
    def test_queue_of_one_and_busy(self, cfg, spec):
        runner = jobs.Runner(cfg, SlowGen(cfg, 0.2))
        j1 = runner.submit(spec, n=8)
        j2 = runner.submit(spec, n=2)          # queued
        with pytest.raises(jobs.Busy):
            runner.submit(spec, n=2)           # one runs, one queued -> busy
        assert runner.cancel(j2.id) == "cancelled"
        assert wait_for(lambda: runner.status(j1.id)["stage"] == "done", timeout=60)
        with pytest.raises(KeyError):
            runner.status(j2.id)               # a cancelled queued job leaves no folder

    def test_cancel_running_job_stops_between_tries(self, cfg, spec):
        runner = jobs.Runner(cfg, SlowGen(cfg, 0.25))
        job = runner.submit(spec, n=8)
        assert wait_for(lambda: runner.status(job.id)["done"] >= 1, timeout=60)
        runner.cancel(job.id)
        assert wait_for(lambda: runner.status(job.id)["stage"] == "cancelled", timeout=60)
        st = runner.status(job.id)
        assert 1 <= st["done"] < 8             # stopped after the current try

    def test_cancel_unknown_job(self, runner):
        with pytest.raises(KeyError):
            runner.cancel("nope")


@needs_spike
class TestTimeouts:
    def test_try_timeout_fails_the_job(self, cfg, spec):
        cfg.try_timeout = 0.05
        runner = jobs.Runner(cfg, SlowGen(cfg, 0.5))
        job = runner.submit(spec, n=4)
        assert wait_for(lambda: runner.status(job.id)["stage"] == "failed", timeout=60)
        assert runner.status(job.id)["message"] == "The motion maker stalled."

    def test_unvalidated_spec_fails_the_job_not_the_service(self, runner):
        job = runner.submit({"sentence": "x"}, n=2)   # seconds/keys missing
        assert wait_for(lambda: runner.status(job.id)["stage"] == "failed", timeout=30)
        assert "message" in runner.status(job.id)
