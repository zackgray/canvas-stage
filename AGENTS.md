# Agent setup guide

If you are an AI coding agent asked to set up or run Canvas Stage for a person, read this first. It is written to be
followed in order. The human-oriented versions are [README.md](README.md) and [SETUP.md](SETUP.md); where they differ,
SETUP.md wins.

## What this is

A local browser app (Node dev server, no accounts) that builds a 3D set and one performer, lets a person fly a camera
through it, records a grey "clay" video, and sends that to Comfy Cloud (LTX-2.5 + Layout-To-Render LoRA) to render
footage. Everything except the Comfy steps runs on the person's machine and is free.

## Rules before you run anything

1. **Paid actions need the person's go.** Stills, 3D builds, looks and Render spend Comfy Cloud credits. Never press or call
   one on your own. Every paid button shows its price first, and the server refuses paid requests until `CANVAS_DAY_BUDGET`
   is set. Do not set a budget the person has not told you.
2. **Never ask for, print or commit the Comfy key.** It lives only in `app/.env` (git-ignored). The browser never sees it.
3. **Open the app as `localhost` or `127.0.0.1`.** The server refuses paid requests from any other origin.
4. `npx vitest run` and `npm run preflight` never load the key for a paid call and cannot bill.

## Step 1: the free tour (no key, no GPU)

Needs Node 22.12 or newer (`node --version`). From the repo root:

```bash
cd app && npm ci && cd ..
node scripts/install-sample.mjs      # copies the sample scene in; safe to run twice; --dry-run previews
cd app && npm run dev                # http://localhost:5173
```

Open Home and click the sample scene. Success: the Stage shows a 3D set with a performer, and Free view, Top View and
Camera view all respond. Recording a take also needs ffmpeg and Python (step 2); looking around does not. If this is all
the person wanted, stop here.

## Step 2: tools for recording

- `ffmpeg` and `ffprobe` on PATH (`ffmpeg -version`, `ffprobe -version`).
- One Python 3 virtual environment outside the repo, then `pip install -r app/scripts/requirements.txt` and
  `<venv python> app/scripts/check_python.py` (lists what imported). On Windows a bare `python` can be the Microsoft Store
  stub; use the venv's full path.

## Step 3: the paid path (only if the person has a Comfy Cloud account with API access)

1. `cp app/.env.example app/.env` and ask the person to fill in, or tell you to fill in: `COMFY_API_KEY`,
   `CANVAS_DAY_BUDGET` (a number of credits; about 150 covers one scene to one rendered take, 300 leaves room for a retry),
   `CANVAS_PYTHON` (full path to the venv's python). Leave `COMFY_BASE_URL` empty; the self-hosted mode is untested.
2. `cd app && npm run preflight`. Free. Prints PASS/FAIL/WARN per check with a one-line fix and exits 1 on any FAIL. Fix
   every FAIL before continuing. A NOTE that the LoRA cannot be verified is expected.
3. **One-time LoRA import per Comfy Cloud account:** the person must have accepted the licence for
   `Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render` on Hugging Face (gated), and Comfy Cloud may need their Hugging Face
   read token in its account secrets. Then run `node scripts/import-lora.mjs` (add `--dry-run` to see the request without
   sending it). It prints "LoRA ready" or a plain reason. This changes the person's account, so confirm first. Without it
   everything before Render works and the first Render fails with a message that points back here.
4. `cd app && npm run dev`. The first line printed starts with `[comfy]` and reports whether the key and budget are set.

## Step 4: prove the chain cheaply

With the person's go, in the app: Home, write one sentence, press Develop (about 4 credits). If that returns, the key,
budget and cloud path work. A first scene taken to one rendered take is roughly 100 to 150 credits and about 20 minutes;
the first Render may fail once if the LoRA import is missing.

## If something fails

- Dev server refuses to start: Node is older than 22.12.
- "Comfy Cloud refused your key or your plan has no API access": wrong key, or a plan without API access.
- A paid press is refused: no day budget, budget spent for today, ffmpeg not on PATH, or a non-localhost origin. The message
  names which.
- Render fails mentioning a LoRA name: step 3.3. If the account lists it under another name, set `CANVAS_L2R_LORA` to that
  name in `app/.env`.
- A dirty `git status` after a paid run is expected: the credit ledger is appended as you work.

## Other commands (in `app/`)

`npm run build` (typecheck and build), `npm run lint`, `npx vitest run` (full suite, cannot bill). The project is
MIT-licensed code; model licences are listed in README.md under "Models and licences".
