"""The real generator: wraps kimodo directly, kept loaded and warm between jobs (plan 1.1).

Layout per the hour-1 gate (GATE.md): the denoiser sits on the configured GPU, the text encoder
(LLM2Vec / Llama 3 8B Instruct) runs on CPU, and embeddings are cached per sentence and passed
in — kimodo's encode() would otherwise default to cuda and re-encode every sample. LLM2Vec's
encode() ignores TEXT_ENCODER_DEVICE at call time, so the device is forced here with
functools.partial(..., device="cpu"), exactly like the gate bench.

This module imports kimodo/torch lazily inside load(): the service starts (and the tests run)
on machines without either. Never call load() outside the box.
"""
import functools
import json
import time
from pathlib import Path

import numpy as np

MODEL_NAME = "Kimodo-SOMA-RP-v1"     # the spike's pinned model; v1.2 untested (plan section 7)
ENCODER_SOURCE = "cpu: llm2vec + Meta-Llama-3-8B-Instruct (built with Meta Llama 3)"


class KimodoGenerator:
    """One process, loaded once: encode (cached) -> generate -> post-process, per try."""

    def __init__(self, config):
        self.cfg = config
        self.model = None
        self.text_cache: dict[tuple, object] = {}
        self.seconds_per_try = None

    def load(self) -> None:
        import os
        if self.cfg.gpu_index is None:
            raise SystemExit("MOTION_BOX_GPU is not set; refusing to load the model.")
        os.environ["CUDA_DEVICE_ORDER"] = "PCI_BUS_ID"
        os.environ["CUDA_VISIBLE_DEVICES"] = str(self.cfg.gpu_index)   # pinned by config; use a GPU no other service needs
        os.environ.setdefault("TEXT_ENCODER_DEVICE", "cpu")
        from kimodo import load_model
        self.model = load_model(MODEL_NAME, device="cuda")
        te = self.model.text_encoder
        inner = te.model                                    # LLM2Vec.encode() defaults to cuda at call time: force cpu (gate finding)
        inner.encode = functools.partial(inner.encode, device="cpu")

        def cached(texts):
            key = tuple(texts)
            if key not in self.text_cache:
                self.text_cache[key] = te(texts)
            return self.text_cache[key]
        self.model.text_encoder = cached

    def warm(self) -> None:
        """One throwaway 2 s generation at boot, so the first user job never pays the CUDA warm-up."""
        self.generate(sentence="A person stands still.", seed=0, seconds=2.0, constraints_path=None)

    def encode(self, sentence: str):
        return self.model.text_encoder([sentence])

    def generate(self, *, sentence: str, seed: int, seconds: float, constraints_path, cls: str = "", embedding=None) -> dict:
        """One try. Returns the npz-style dict the rest of the pipeline reads (posed_joints, ...)."""
        from kimodo.constraints import load_constraints_lst
        from kimodo.tools import seed_everything
        seed_everything(seed)
        cons = load_constraints_lst(str(constraints_path), self.model.skeleton) if constraints_path else []
        t0 = time.monotonic()
        out = self.model([sentence], [int(round(seconds * self.model.fps))], num_denoising_steps=100, num_samples=1,
                         multi_prompt=False, constraint_lst=cons, post_processing=True, return_numpy=True,
                         progress_bar=lambda x: x)
        single = {k: (v[0] if hasattr(v, "shape") and v.ndim > 0 and v.shape[0] == 1 else v) for k, v in out.items()}
        self.seconds_per_try = time.monotonic() - t0
        return single

    def save_try(self, arrays: dict, path) -> None:
        np.savez(path, **{k: np.asarray(v) for k, v in arrays.items()})

    def health(self) -> dict:
        free = None
        try:  # best effort: free VRAM on the pinned GPU
            import subprocess
            out = subprocess.run(["nvidia-smi", "-i", str(self.cfg.gpu_index), "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
                                 capture_output=True, text=True, timeout=5).stdout.split()
            free = int(out[0]) if out else None
        except Exception:
            pass
        name = "cuda:" + str(self.cfg.gpu_index)
        try:
            import torch
            if torch.cuda.is_available():
                name = torch.cuda.get_device_name(0)     # index 0 under CUDA_VISIBLE_DEVICES
        except Exception:
            pass
        return {"name": name, "freeMiB": free}
