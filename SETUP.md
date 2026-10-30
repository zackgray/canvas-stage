# Setup checklist

From a fresh clone to a first rendered take. Part A is the free tour: no key, no GPU, no paid call. Part B is the paid
path. The README explains what the app does and what each stage costs. Written for people who already know Comfy Cloud.

## A. Free tour (about five minutes)

- [ ] **Node 22.12 or newer** (`node --version`).
- [ ] Install and load the sample scene, from the repo root:

  ```bash
  cd app && npm ci && cd ..
  node scripts/install-sample.mjs     # safe to run twice; --dry-run shows what it would do
  cd app && npm run dev
  ```

- [ ] Open **http://localhost:5173/** (use `localhost` or `127.0.0.1`; other origins are refused). Home lists "A rain-drenched
  racetrack at midnight". Click it: the Stage opens on the set. Look around, switch Free view, Top View and Camera, fly
  the camera (WASD, mouse or arrows, or a DualSense), press **Controls** for every key. Nothing paid fires.

Without ffmpeg and Python you cannot lock a take's clay, but everything above works. The dev server prints a `[comfy]` line at start
and names missing Python packages; `npm run preflight` (Part B, step 4) checks everything at once.

## B. Paid path

The one ordered checklist. Budget about **20 minutes and about 150 credits (roughly US$0.75) to one rendered take**. The
first Render can fail once if the LoRA import (step 5) is missing; everything before Render is unaffected.

### 1. Tools on your machine

- [ ] **ffmpeg with ffprobe** on your PATH (`ffmpeg -version`, `ffprobe -version`). Locking a take refuses without it.
- [ ] **One Python 3 venv** for the local steps (Render finish, colour match, face pass, massing clay). No GPU.

  ```bash
  python -m venv <venv-dir>                                        # anywhere outside the repo
  <venv-dir>/Scripts/pip install -r app/scripts/requirements.txt   # bin/ instead of Scripts/ on macOS / Linux
  ```

  Note the full path of that venv's `python` for step 3. `requirements-core.txt` (OpenCV, numpy) is enough for the Render
  finish; the massing clay of built pieces also needs trimesh, scipy and scikit-image.

### 2. Comfy Cloud key

- [ ] On cloud.comfy.org, a plan with API access (the free tier has none; the app was built on Creator, which also allows
  importing Hugging Face LoRAs). Create an **API key**. It goes only in `app/.env`.
- [ ] Your Hugging Face account needs the licence accepted on the
  [Layout-To-Render LoRA page](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render) (gated), and a
  **read token** added to Comfy Cloud under Settings > Secrets, or Cloud cannot fetch the file in step 5.

### 3. app/.env

- [ ] Copy `app/.env.example` to `app/.env` (Windows: `copy app\.env.example app\.env`) and set:

  ```bash
  COMFY_API_KEY=<your key>
  CANVAS_DAY_BUDGET=300
  CANVAS_PYTHON=<full path to the venv's python from step 1; Windows: ...\Scripts\python.exe>
  ```

  **What number for the budget:** set `300`. One scene taken through to one rendered take is about 150 credits, so 300
  leaves room for a retry. It is the most the app will spend per local day; the app refuses any press that would pass it, and
  nothing else limits spend. Unset or 0 refuses every paid press. Change it any time and restart the dev server.
  On Windows leave `CANVAS_PYTHON` as a full path: the bare `python` is usually the Microsoft Store stub, which does not run.

### 4. Prove it, for free

- [ ] ```bash
  cd app && npm ci && cd ..          # skip both of these if you did Part A
  node scripts/install-sample.mjs
  cd app && npm run preflight        # no credits spent; same as: node scripts/preflight.mjs
  ```

  It prints one PASS / FAIL / WARN line per check with the fix: Node, ffmpeg and ffprobe, `.env`, the key (a free balance
  call), the day budget, Python and its packages, the sample scene. It cannot see the LoRA (step 5). Fix every FAIL and run it
  again.

### 5. Import the Layout-To-Render LoRA (once per account)

Cloud lists no per-account imports, so the app cannot check this; without it the first Render fails.

- [ ] ```bash
  node scripts/import-lora.mjs       # reads the key from app/.env; --dry-run shows the request and sends nothing
  ```

  It asks Cloud to fetch the file, waits for the task, and prints `LoRA ready`. Safe to run again. On a gated, 401 or 403
  failure it says to accept the licence and add the Hugging Face read token (step 2), then run it again. If your account
  lists the import under a different name, set `CANVAS_L2R_LORA` to it in `app/.env`.

  **By hand instead** (the same request the script sends):

  ```bash
  # bash / Git Bash, from the repo root
  KEY=$(grep '^COMFY_API_KEY=' app/.env | cut -d= -f2-)
  curl -X POST https://cloud.comfy.org/api/assets/download \
    -H "X-API-Key: $KEY" -H "content-type: application/json" \
    -d '{"source_url": "https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render/resolve/main/ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors", "tags": ["models", "loras"]}'
  # then, with the task id from the 202 reply, until it reports completed:
  curl -H "X-API-Key: $KEY" https://cloud.comfy.org/api/tasks/<task id>
  ```

  ```powershell
  # PowerShell, key pasted by hand
  $h = @{ "X-API-Key" = "<your key>" }
  $body = '{"source_url": "https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render/resolve/main/ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors", "tags": ["models", "loras"]}'
  Invoke-RestMethod -Method Post -Uri https://cloud.comfy.org/api/assets/download -Headers $h -ContentType "application/json" -Body $body
  Invoke-RestMethod -Headers $h -Uri https://cloud.comfy.org/api/tasks/<task id>     # repeat until completed
  ```

### 6. First paid run

- [ ] `cd app && npm run dev`. The terminal prints a `[comfy]` line: key present, day budget, ffmpeg, Node. Open
  http://localhost:5173/.
- [ ] Home: write one sentence ("A ranger walks across a frozen hillside camp at dawn") and press **Develop** (about 4 cr).
  That proves key, budget and Cloud. **Use my words as they are** skips it for free.
- [ ] On the Stage: **Build the set** (about 4 cr). Pick **The subject**, Generate looks, pick one, Use this look.
- [ ] **Camera**: pick a preset move (2 s is cheapest) or fly the camera and record, then lock the take.
- [ ] **Draw** the opening frame (about 21 to 39 cr) and approve it; then **Render** (about 16 to 30 cr for 2 to 4 s). The
  finish runs by itself; the clip plays on Render and downloads from Export.

If a press is refused, the message says why. Usual causes: no day budget, the budget is spent for today, ffmpeg not on PATH,
or (on Render) the LoRA import. The app appends every paid job to `app/experiments/credit-log.md`; a dirty `git status` after a
run is expected.

### Checkpoints

| After | You should see | Cost |
|---|---|---|
| Step 4 | `npm run preflight` ends with "All required checks passed" | 0 |
| Step 5 | `LoRA ready` | 0 |
| Step 6, dev server up | the `[comfy]` line in the terminal; Home lists the sample racetrack | 0 |
| **Develop** | the Stage lists people and props. **The cheapest paid proof**: key, budget and Cloud all work | about 4 cr |
| Build the set | a set in 3D | about 4 cr |
| Draw, then Render | the finished take. This is where a missing LoRA shows up (the Render error says so) | about 40 to 70 cr |

Common refusals: "Comfy Cloud refused your key or your plan has no API access" is a bad key or a plan without API access;
"Render needs the one-time LoRA import" means step 5.

## Optional

- **Gamepad.** The camera takes a standard gamepad (DualSense supported) or the keyboard; Controls shows the mapping.
- **Tests.** `npx vitest run` in `app/`. The suite never loads your key and cannot bill.
- **Self-hosted ComfyUI.** Not ready (README, "Connecting to Comfy"). The graphs in `app/workflows/` can be loaded into your
  own ComfyUI by hand.
- **The motion service (new moves from words).** A small always-on service on a CUDA Linux machine (`motionbox/`; run
  `bash motionbox/setup.sh` on that machine first). It is optional: without it the ready-made moves work. The app reaches it
  over an SSH local port-forward, so the machine's host name goes in no file:

  ```bash
  ssh -L 9650:127.0.0.1:9650 <the motion machine>   # kept open while you work
  ```

  then in `app/.env`:

  ```bash
  MOTION_BOX_URL=http://127.0.0.1:9650
  MOTION_BOX_TOKEN=<the shared secret the service was started with>
  ```

  With either unset, **Describe a move** says the motion computer isn't set up. On the machine, `GET /health` (with
  `Authorization: Bearer <token>`) reports the service's state.
