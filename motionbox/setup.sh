#!/usr/bin/env bash
# Set up the motion box service on a CUDA Linux machine (plan 1.1, section 7).
# Usage: bash setup.sh [venv_dir]   (default venv: ~/motionbox-venv)
#
# Downloads (into the venv / HF cache, never into this repo):
#   - kimodo at the spike's pinned commit (Apache-2.0 code)
#   - NVIDIA Kimodo SOMA weights (NVIDIA Open Model License)
#   - the text encoder: McGill-NLP LLM2Vec Llama-3 adapters (MIT) + Meta Llama 3 8B Instruct
#     (Meta Llama 3 Community License; "Built with Meta Llama 3")
#
# The Llama base weights download from the OFFICIAL Meta repo by default and require your own
# gated access (request it at https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct; export
# HF_TOKEN). To use a mirror instead, pass its HF id or local path explicitly:
#   MOTION_BOX_LLAMA_MIRROR=<id-or-path> bash setup.sh
set -euo pipefail

VENV="${1:-$HOME/motionbox-venv}"
KIMODO_COMMIT="${KIMODO_COMMIT:-3b98f78}"   # spike-pinned upstream commit (v1.2 untested)

python3 -m venv "$VENV"
# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install --upgrade pip
pip install numpy scipy pytest        # service + test deps (torch/kimodo bring the rest)

pip install torch --index-url https://download.pytorch.org/whl/cu121
pip install git+https://github.com/NVIDIA/kimodo.git@"$KIMODO_COMMIT"

# Text encoder base: official Meta repo by default, explicit mirror only as an override.
LLAMA="meta-llama/Meta-Llama-3-8B-Instruct"
if [ -n "${MOTION_BOX_LLAMA_MIRROR:-}" ]; then
  echo "using explicit Llama mirror override: $MOTION_BOX_LLAMA_MIRROR"
  LLAMA="$MOTION_BOX_LLAMA_MIRROR"
fi
python - "$LLAMA" <<'PY'
import sys
from huggingface_hub import snapshot_download
snapshot_download(sys.argv[1], allow_patterns=["*.json", "*.txt", "*.safetensors", "*.model"])
for repo in ("McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp",
             "McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp-supervised"):
    snapshot_download(repo)
PY

# 35_01.bvh's header is needed on the box for retargeting; it is CMU data already in the repo.
cp "$(dirname "$0")/../app/public/mocap/cmu/35_01.bvh" "$(dirname "$0")/data/35_01.bvh"

cat <<EOF
Done. To run the service (pin the GPU index first; it refuses to start without it):
  export MOTION_BOX_TOKEN=$(head -c 18 /dev/urandom | base64)
  export MOTION_BOX_GPU=1                 # the index of a dedicated GPU; never one another service uses
  $VENV/bin/python -m motionbox.server    # add --fake to serve stored spike outputs instead
Reach it from another machine with an SSH local port-forward (ssh -L 9650:127.0.0.1:9650 <the box>).
EOF
