"""Service configuration: loopback bind, shared token, GPU index, data and job folders.

Everything comes from the environment (or an optional JSON file); nothing is VITE_-style
client-visible and no host name appears here. The GPU index is required for the real
generator and must point at a dedicated GPU, never the one another service uses; fake mode needs no GPU.

Env:
  MOTION_BOX_TOKEN    shared secret, required on every HTTP call (and to start the service)
  MOTION_BOX_GPU      CUDA device index for the real generator; refusing to start if unset
  MOTION_BOX_HOST     bind address, defaults to 127.0.0.1 (loopback only)
  MOTION_BOX_PORT     listen port, default 9650
  MOTIONBOX_SPIKE_DIR where the fake generator reads the spike's stored clips from
  MOTIONBOX_JOBS_DIR  job folder root, default ~/.cache/motionbox/jobs
  MOTION_BOX_LOOSEN   free words keep their imperfect tries (default on; 0/false restores the old filters)
  MOTIONBOX_CONFIG    optional JSON file with the same keys (lowercase)
"""
import json, os
from dataclasses import dataclass, field
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent  # the motionbox/ project folder
REPO = PROJECT.parent


@dataclass
class Config:
    host: str = "127.0.0.1"
    port: int = 9650
    token: str | None = None
    gpu_index: int | None = None      # real mode only; fake mode ignores it
    fake: bool = False
    spike_dir: Path = field(default_factory=lambda: Path.home() / "spike-kimodo-2026-10-25")
    data_dir: Path = field(default_factory=lambda: PROJECT / "data")
    jobs_dir: Path = field(default_factory=lambda: Path.home() / ".cache" / "motionbox" / "jobs")
    try_timeout: float = 120.0        # one try, then the job fails (plan 1.4)
    job_timeout: float = 600.0        # whole job
    job_ttl: float = 24 * 3600        # job folders are deleted by age
    loosen: bool = True               # free words (no hand targets) keep tries the soft filters would drop, marked would_drop

    @property
    def header_bvh(self) -> Path:
        """35_01.bvh (CMU data shipped in the repo) for the retargeted BVH header."""
        local = self.data_dir / "35_01.bvh"
        if local.exists():
            return local
        return REPO / "app" / "public" / "mocap" / "cmu" / "35_01.bvh"

    def validate(self) -> None:
        if not self.token:
            raise SystemExit("MOTION_BOX_TOKEN is not set; the service needs a shared secret.")
        if self.host not in ("127.0.0.1", "localhost", "::1"):
            raise SystemExit(f"refusing to bind {self.host!r}; the service is loopback only.")
        if not self.fake and self.gpu_index is None:
            raise SystemExit("MOTION_BOX_GPU is not set; refusing to start the real generator.")


def load(path: str | None = None, **overrides) -> Config:
    cfg = Config()
    src: dict = {}
    env_path = path or os.environ.get("MOTIONBOX_CONFIG")
    if env_path and Path(env_path).exists():
        src = json.load(open(env_path))
    for key in ("host", "token"):
        if key in src and src[key] is not None:
            setattr(cfg, key, src[key])
        env = os.environ.get("MOTION_BOX_" + key.upper())
        if env:
            setattr(cfg, key, env)
    for key in ("port", "gpu_index"):
        env = os.environ.get("MOTION_BOX_" + key.upper()) or (os.environ.get("MOTION_BOX_GPU") if key == "gpu_index" else None) or src.get(key)
        if env is not None:
            setattr(cfg, key, int(env))
    for key in ("try_timeout", "job_timeout", "job_ttl"):
        env = os.environ.get("MOTION_BOX_" + key.upper()) or src.get(key)
        if env is not None:
            setattr(cfg, key, float(env))
    env = os.environ.get("MOTION_BOX_LOOSEN")
    if env is not None or "loosen" in src:
        cfg.loosen = str(env if env is not None else src["loosen"]).strip().lower() not in ("0", "false", "no", "off")
    for key in ("spike_dir", "jobs_dir"):
        env = os.environ.get("MOTIONBOX_" + key.upper()) or src.get(key)
        if env:
            setattr(cfg, key, Path(env))
    for key, val in overrides.items():
        if val is not None and hasattr(cfg, key):
            setattr(cfg, key, val)
    cfg.validate()
    return cfg
