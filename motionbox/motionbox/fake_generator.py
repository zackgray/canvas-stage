"""Fake generator: returns the spike's stored outputs (chosen / candidates / lower folders),
perturbed deterministically by seed. Used by the pytest suite (CPU only) and by `--fake` runs
on any machine, so the app's own fake box can be swapped for this service locally.

Clip choice follows the spec's class so a lift spec gets the lift output, a pick-up spec the
pick-up, and so on. Set MOTIONBOX_SPIKE_DIR to where the spike folder lives.
"""
from pathlib import Path
import numpy as np

# spec class (Track C's MoveSpec) -> stored clip stem, most specific first: "takeOutHoldUp"
# contains "holdup" as a substring, so the lift must be matched before the plain hold-up.
CLASS_CLIPS = [
    ("takeout", "c15"), ("take out", "c15"), ("lift", "c15"),
    ("putdown", "d02"), ("put down", "d02"), ("put", "d02"),
    ("pickup", "p02"), ("pick up", "p02"), ("pick", "p02"),
    ("carry", "k02"), ("walk", "k02"),
    ("gesture", "c01"), ("holdup", "c07"), ("hold up", "c07"),
]
NOISE_M = 0.002   # per-joint perturbation, small enough to keep every metric in family


def _smooth_noise(seed, shape):
    """Low-frequency per-joint drift (std NOISE_M): white noise low-passes time-correlated
    perturbations, so per-frame velocities (foot slide, jitter) stay realistic."""
    rng = np.random.default_rng(seed)
    white = rng.normal(0.0, 1.0, shape)
    kernel = np.hanning(31)
    kernel /= kernel.sum()
    smooth = np.apply_along_axis(lambda a: np.convolve(a, kernel, mode="same"), 0, white)
    return (smooth / smooth.std() * NOISE_M).astype(np.float32)

ENCODER_SOURCE = "fake (stored spike outputs)"


class FakeGenerator:
    def __init__(self, config):
        self.cfg = config
        self.dirs = [Path(config.spike_dir) / d for d in ("candidates", "chosen", "lower")]
        self._cache: dict[str, dict] = {}
        self.seconds_per_try = 0.05
        self.encode_calls = 0

    def load(self) -> None:
        if not self.dirs[0].parent.is_dir():
            raise FileNotFoundError(f"fake generator: spike folder not found at {self.dirs[0].parent}")

    def warm(self) -> None:
        pass

    def encode(self, sentence: str):
        self.encode_calls += 1
        return sentence

    def _clip(self, cls: str) -> str:
        cls = (cls or "").lower()
        for key, stem in CLASS_CLIPS:
            if key in cls:
                return stem
        return "c15"

    def _load(self, stem: str) -> dict:
        if stem not in self._cache:
            for d in self.dirs:
                p = d / (stem + ".npz")
                if p.exists():
                    z = np.load(p)
                    self._cache[stem] = {k: z[k] for k in z.files}
                    break
            else:
                raise FileNotFoundError(f"stored clip {stem!r} not found under {self.dirs[0].parent}")
        return self._cache[stem]

    def generate(self, *, sentence: str, seed: int, seconds: float, constraints_path, cls: str = "", embedding=None) -> dict:
        """A stored output copy with posed_joints perturbed by the seed (deterministic, smooth in time)."""
        base = self._load(self._clip(cls))
        out = {k: np.array(v) for k, v in base.items()}
        out["posed_joints"] = out["posed_joints"] + _smooth_noise(seed, out["posed_joints"].shape)
        return out

    def save_try(self, arrays: dict, path) -> None:
        np.savez(path, **{k: np.asarray(v) for k, v in arrays.items()})

    def health(self) -> dict:
        return {"name": "fake-gpu (no model loaded)", "freeMiB": 0}
