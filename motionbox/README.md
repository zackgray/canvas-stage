# Motion box service

A small always-on HTTP service that makes human moves from words: the app sends a **MoveSpec**
(hand targets, grab/release, the motion sentence), the box turns it into Kimodo end-effector
constraints, generates tries, scores them, retargets the top 3 onto CMU-35 with hand-IK and
serves each try's BVH / stick-figure strip / scores. The wire format is
`docs/motion-box-contract.md`.

## Layout

- `motionbox/server.py` — loopback HTTP service (`Authorization: Bearer <MOTION_BOX_TOKEN>` on
  every call; one GPU job at a time, a queue of 1; warm-up generation at boot)
- `motionbox/jobs.py` — job state machine: encoding → generating k/N → scoring → retargeting →
  done/failed/cancelled; N tries per round, one automatic second round (cap 16); a try that
  overruns 120 s or a job that overruns 10 min fails; job folders live 24 h
- `motionbox/constraints.py` — MoveSpec → Kimodo constraints, with the base-pose bank
  (`data/base_poses.npz`: reach-low, hold-chest, hold-high, stand — a few frames of real
  generated output; the licence does not claim outputs)
- `motionbox/score.py` — the eight checks of plan section 3 and the one weights table
- `motionbox/retarget.py` + `motionbox/handik.py` — CMU-35 retarget (35_01 header verbatim,
  120 fps, floor at y=0) with wrist-restoring hand-IK
- `motionbox/preview.py` — stick-figure strip PNG (no plotting dependency)
- `motionbox/generator.py` — the real Kimodo wrapper (loads once, warm at boot, text encoder on
  CPU with the embedding cached per sentence — kimodo's `encode()` ignores
  `TEXT_ENCODER_DEVICE=cpu`, so the device is forced at the call)
- `motionbox/fake_generator.py` — serves the spike's stored outputs, perturbed by seed; no GPU
- `tests/` — pytest, CPU only, against the fake generator

## Run it

Fake mode (any machine, no GPU/model; needs the spike folder, see `MOTIONBOX_SPIKE_DIR`):

```bash
export MOTION_BOX_TOKEN=dev-token
python -m motionbox.server --fake --port 9650
```

Real mode (a CUDA Linux machine; `bash setup.sh` first):

```bash
export MOTION_BOX_TOKEN=...        # same value as the app's MOTION_BOX_TOKEN
export MOTION_BOX_GPU=1            # the GPU index you pin; the service refuses to start without it
python -m motionbox.server
```

The service binds 127.0.0.1 only. From another machine reach it with an SSH local port-forward
(`ssh -L 9650:127.0.0.1:9650 <the motion box>`); nothing is opened on the LAN.

## Tests

```bash
python -m pytest motionbox        # from the repo root; CPU only, fakes only
```

Fixture-dependent tests read the spike's stored clips; point `MOTIONBOX_SPIKE_DIR` at the spike
folder (default `~/spike-kimodo-2026-10-25`). Without it, those tests skip and the state-machine
tests still run.

## Models and licences

- Generated moves: NVIDIA Kimodo (Apache-2.0 code, NVIDIA Open Model License weights — "NVIDIA
  does not claim ownership to any outputs"). Pinned at the spike's commit; v1.2 untested.
- Text encoder: Meta Llama 3 8B Instruct — Built with Meta Llama 3, used under the Meta Llama 3
  Community License; embeddings only steer Kimodo at run time. `setup.sh` downloads from the
  official Meta repo by default (gated: request access yourself); a mirror only as the explicit
  `MOTION_BOX_LLAMA_MIRROR` override.
- LLM2Vec adapters: MIT. CMU mocap header: CMU's free-use terms, already credited in the app.
- The ComfyUI-Kimodo pack drives the same model but its foot-cleanup node is broken and its
  export reloads the model per call; this service wraps kimodo directly for those reasons.
