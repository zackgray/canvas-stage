"""Job state machine (plan 1.1, 3): one GPU job at a time, a queue of 1, cancel, busy, timeouts.

A job runs N tries (default 8, seeds fixed per job so a rerun is reproducible), scores each try
as it finishes, drops hard-filtered tries, and — if fewer than 2 survive round 1 — runs one
automatic second round of N new seeds, capping at 16 total (plan 3). The top 3 survivors (5 for a loosened free-words job) are
retargeted onto CMU-35 with hand-IK and get a stick-figure strip. Job folders live for 24 h.

Stages: encoding -> generating k/N -> scoring -> retargeting -> done | failed | cancelled.
"""
import json
import threading
import time
import uuid
from pathlib import Path

from . import constraints, preview, retarget, score

TOP_KEEP = 3
LOOSE_KEEP = 5      # a loosened (free words) job keeps the best 5: the app shows them as a picker
MAX_TRIES = 16


class Try:
    def __init__(self, idx, seed):
        self.id = f"try{idx}"
        self.seed = seed
        self.arrays = None
        self.result = None      # score.analyze output
        self.seconds = 0.0

    def public(self):
        t = {"id": self.id, "seed": self.seed, "rank": None, "reason": None,
             "scores": self.result["metrics"] if self.result else None, "seconds": round(self.seconds, 2)}
        if self.result and self.result.get("would_drop"):
            t["would_drop"] = [score.dropped_reason([f]) for f in self.result["would_drop"]]
        if self.result and not self.result["failed"]:
            t["rank"] = self.result.get("rank"); t["reason"] = self.result.get("reason")
        return t


class Job:
    def __init__(self, spec, n, seeds):
        self.id = uuid.uuid4().hex[:12]
        self.spec = spec
        self.n = min(max(1, n), 8)
        self.seeds = seeds
        self.stage = "encoding"
        self.round = 1
        self.done = 0
        self.tries: list[Try] = []
        self.dropped: list[Try] = []
        self.message = None
        self.cancelled = False
        self.loose = False      # set when the run starts: free words under the loosen flag
        self.created = time.time()


class Runner:
    """Owns the worker thread, the running job and (at most) one queued job."""

    def __init__(self, config, generator):
        self.cfg = config
        self.gen = generator
        self.bank = constraints.load_bank(config.data_dir)
        self.resolver = constraints.ClipResolver(config.spike_dir) if config.fake else None
        self.lock = threading.Lock()
        self.current: Job | None = None
        self.queued: Job | None = None
        self.thread: threading.Thread | None = None
        self.jobs_dir = Path(config.jobs_dir)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    # -- lifecycle ------------------------------------------------------
    def submit(self, spec: dict, n: int = 8, seeds=None) -> Job:
        job = Job(spec, n, list(seeds) if seeds else self._default_seeds(spec, n))
        with self.lock:
            if self.current is None:
                self.current = job
                self._start_locked()
            elif self.queued is None:
                self.queued = job
            else:
                raise Busy()
        return job

    def cancel(self, job_id: str) -> str:
        job = self.get(job_id)
        if job is None:
            raise KeyError(job_id)
        if isinstance(job, dict):     # already finished
            return job["stage"]
        with self.lock:
            if job is self.queued:
                self.queued = None
                job.stage = "cancelled"
            else:
                job.cancelled = True  # the run stops after the current try
        return job.stage

    def get(self, job_id: str):
        for j in (self.current, self.queued):
            if j and j.id == job_id:
                return j
        path = self.jobs_dir / job_id / "job.json"
        if path.exists():
            return json.load(open(path))  # finished job: on-disk record
        return None

    def busy(self) -> bool:
        with self.lock:
            return self.current is not None or self.queued is not None

    def _start_locked(self):
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _default_seeds(self, spec, n) -> list[int]:
        import hashlib
        h = int(hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:8], 16)
        return [(h + 1000 * i) % (2 ** 31) for i in range(n)]

    # -- the run --------------------------------------------------------
    def _run(self):
        try:
            self._work(self.current)
        finally:
            with self.lock:
                self.current = self.queued
                self.queued = None
            if self.current is not None:
                with self.lock:
                    self._start_locked()

    def _work(self, job: Job):
        deadline = time.monotonic() + self.cfg.job_timeout
        folder = self.jobs_dir / job.id
        folder.mkdir(parents=True, exist_ok=True)
        try:
            job.loose = bool(self.cfg.loosen) and not job.spec.get("keys")
            json.dump(job.spec, open(folder / "spec.json", "w"))      # kept with the job so a failed make can be diagnosed
            job.stage = "encoding"
            self.gen.encode(job.spec["sentence"])          # cached per sentence; CPU
            cons_entries, _ = constraints.materialize(job.spec, self.bank, self.resolver)
            cons_path = folder / "constraints.json"
            json.dump(cons_entries, open(cons_path, "w"))
            survivors: list[Try] = []
            total = 0
            for rnd in (1, 2):
                job.round = rnd
                for i in range(job.n):
                    if job.cancelled:
                        break
                    if time.monotonic() > deadline:
                        raise TimeoutError("job")
                    k = (rnd - 1) * job.n + i
                    seed = job.seeds[k] if k < len(job.seeds) else job.seeds[-1] + 1000 * i + rnd
                    job.stage = f"generating {job.done + 1}/{job.n * rnd}"
                    tr = Try(total, seed)
                    tr.arrays, tr.seconds = self._one_try(job, seed, cons_path)
                    job.stage = "scoring"
                    tr.result = score.analyze(tr.arrays["posed_joints"], tr.arrays["foot_contacts"].astype(bool), job.spec, loosen=job.loose)
                    job.done += 1
                    total += 1
                    (job.dropped if tr.result["failed"] else survivors).append(tr)
                    job.tries.append(tr)
                if job.cancelled or len(survivors) >= 2 or total >= MAX_TRIES or rnd == 2:
                    break
            if job.cancelled:
                job.stage = "cancelled"
            else:
                self._finish(job, folder, survivors)
        except TimeoutError:
            job.stage = "failed"
            job.message = "The motion maker stalled."
        except Exception as e:  # the job fails, the service stays up
            job.stage = "failed"
            job.message = f"{type(e).__name__}: {e}"
        json.dump(self._status(job), open(folder / "job.json", "w"))

    def _one_try(self, job, seed, cons_path):
        t0 = time.monotonic()
        out = self.gen.generate(sentence=job.spec["sentence"], seed=seed, seconds=job.spec.get("seconds", 8.0),
                                constraints_path=cons_path, cls=job.spec.get("class", ""))
        seconds = time.monotonic() - t0
        if seconds > self.cfg.try_timeout:
            raise TimeoutError("try")
        return out, seconds

    def _finish(self, job: Job, folder: Path, survivors: list[Try]):
        job.stage = "retargeting"
        score.rank([t.result for t in survivors])          # adds rank + reason in place
        kept = sorted((t for t in survivors if t.result.get("rank", 99) <= self._keep(job)), key=lambda t: t.result["rank"])
        prop = job.spec.get("grab") is not None
        for t in kept:
            npz = folder / f"{t.id}.npz"
            self.gen.save_try(t.arrays, npz)
            retarget.retarget_npz(npz, self.cfg.header_bvh, folder / f"{t.id}.bvh", hand_ik=True)
            preview.strip(folder / f"{t.id}.bvh", folder / f"{t.id}.png", prop=prop)
            json.dump(t.public(), open(folder / f"{t.id}.json", "w"))
        job.stage = "done"

    @staticmethod
    def _keep(job: Job) -> int:
        return LOOSE_KEEP if job.loose else TOP_KEEP

    # -- status ---------------------------------------------------------
    def _status(self, job: Job) -> dict:
        out = {"id": job.id, "stage": job.stage, "done": job.done, "of": job.n * job.round, "round": job.round,
               "tries": sorted((t.public() for t in job.tries if t.result and not t.result["failed"]),
                               key=lambda t: t["rank"] or 99)[:self._keep(job)],
               "dropped": {"count": len(job.dropped), "reason": self._drop_reason(job)}}
        if job.message:
            out["message"] = job.message
        return out

    def status(self, job_id: str) -> dict:
        job = self.get(job_id)
        if job is None:
            raise KeyError(job_id)
        if isinstance(job, dict):  # finished, from disk
            return job
        self.sweep()
        return self._status(job)

    def _drop_reason(self, job) -> str | None:
        if not job.dropped:
            return None
        reasons = [score.dropped_reason(t.result["failed"]) for t in job.dropped]
        common = max(set(reasons), key=reasons.count)
        return f"{len(job.dropped)} of {job.done} dropped because {common}."

    def sweep(self):
        """Delete job folders older than the TTL (24 h)."""
        import shutil
        now = time.time()
        for p in self.jobs_dir.iterdir():
            if p.is_dir() and now - p.stat().st_mtime > self.cfg.job_ttl:
                shutil.rmtree(p, ignore_errors=True)


class Busy(Exception):
    """One job runs and one is queued already."""

