# How Canvas Stage talks to Comfy

Everything that touches Comfy runs on the Node side of the app (the Vite dev server and the scripts), through the
official TypeScript SDK `@comfyorg/sdk` (Comfy API v2). The browser never calls Comfy and never holds a key.

## Pieces

| Piece | Where | Role |
|---|---|---|
| Target selection | `app/server/comfy/target.ts` | `COMFY_BASE_URL` unset means Comfy Cloud; set means a v2 deployment at that URL |
| Run helpers | `app/server/comfy/run.ts` | one shared SDK client per process (`new Comfy({ clientInfo: "canvas-stage" })`), load a graph, bind local files to loader nodes, submit, wait, download outputs |
| Discovery | `app/server/comfy/discovery.ts` | read `/api/object_info` to list nodes and models |
| Stills endpoint | `app/server/stills/` | `POST /__lab/still` runs one Stills-lab render; `GET /__lab/stills` lists exports and the cap count |
| Settle endpoint | `app/server/settle/` | `POST /__lab/settle` runs one settle turn; `GET /__lab/settle` reports busy state and cap count |
| Location endpoint | `app/server/location/` | `POST /__lab/location/candidates` renders 4 candidate stills in one job; `POST /__lab/location/pick` runs MoGe-2 on the chosen one and adds it to `lab-assets/locations/manifest.json` (a re-pick is free); `GET /__lab/location` reports busy state, the last batch and cap count |
| Look endpoint | `app/server/look/` | `GET`/`POST /__lab/look/settings` and `POST`/`DELETE /__lab/look/reference` keep each location's look (mood, time of day, atmosphere, up to 2 JPEG/PNG references) under `lab-assets/looks/<shot id, "/" written as "@">/`; `POST /__lab/look/grade` runs one Cloud grade of a still; `POST /__lab/look/finish` runs the free local finish; `GET /__lab/look` reports busy state, cap count and every result. Results go to `<export>/looks/`, beside the stills, never over them |
| Clip endpoint | `app/server/clip/` | `POST /__lab/clip` renders one LTX-2.5 clip from a still and a take's depth guide; `POST /__lab/clip/finish` runs the free local Finish on every frame of a clip (`GET` lists them); `GET /__lab/clip` reports busy state, cap count and every clip on disk. The guide video, clips and their records go to `lab-assets/renders/video-<stamp>/`, which the endpoint also serves (mp4 with byte ranges, for the player). Needs `ffmpeg` and `ffprobe` on the dev server's PATH |
| CrossView endpoint | `app/server/crossview/` | `POST /__lab/crossview` re-films an approved performance from an Operator take: the take's warp (`lab-assets/renders/warp-<stamp>/`, exported free by the Render page: 960x544, 24 fps, 8n+1 frames, holes pure magenta, `cameras.json` with the pack id and `sourceStart`) and the performance pack's source clip, cut to the same window, go to LTX-2.3 with the CrossView-Warp IC-LoRA (`workflows/crossview_ltx-warp.api.json`, E29's graph); `GET /__lab/crossview` reports busy state, phase, cap count and every render on disk. The warp folder and pack are checked for free before anything is counted (frame names, count, size, exact magenta in the PNGs, an almost-empty warp). Needs `ffmpeg` and `ffprobe` on PATH and the LoRA imported into the Cloud account (root README) |
| Save endpoint | `app/vite.config.ts` | `POST /__lab/save?path=...` writes an export (render, mask, depth guide) under `app/public/lab-assets/renders/` |
| Origin guard | `app/server/guard.ts` | the endpoints refuse requests from any origin except `localhost` / `127.0.0.1`, and the JSON ones require `application/json` |

The endpoints are registered with `apply: 'serve'`, so they exist only under `npm run dev`. The Vite config reads
`COMFY_API_KEY`, `COMFY_BASE_URL`, `CANVAS_STILL_CAP`, `CANVAS_SETTLE_CAP`, `CANVAS_LOCATION_CAP`,
`CANVAS_LOOK_CAP`, `CANVAS_CLIP_CAP`, `CANVAS_CROSSVIEW_CAP` and `CANVAS_CROSSVIEW_LORA` from `app/.env` (no `VITE_` prefix,
so nothing is exposed to browser code) and copies the first two into the server process environment.

Flow for one render: the lab exports the stage view (colour, hole mask, depth guide) through `/__lab/save`, then
posts a request to `/__lab/still` or `/__lab/settle`. The server builds the graph in code, uploads the exported
files through the SDK, submits, waits, downloads the outputs to `app/public/lab-assets/`, and returns the paths.
Exports are rendered offscreen, so a still or grade input never carries the live view's overlays.
A Location turn is the same shape: describe, one candidates job, pick, one MoGe-2 job, and the new set loads.

A clip runs in Operator mode. Record a take (the guide uses its first 5 s), press **Go to take start** (the camera lands exactly on the
take's first smoothed pose and lens), take a still there, optionally Grade or Finish it, then **Export guide**: free
and local, the smoothed take resampled at 24 fps to 8n+1 frames (at most 121), each rendered at 768x448 through that
sample's lens as near-bright inverse depth with holes at 0, plus a `cameras.json`. Pick the first frame (the still or
a kept grade / finish of it). The lab and the endpoint both refuse a first frame whose export camera is more than
5 cm, 1 degree or 0.5 degree of vertical fov away from the guide's frame 0. **Render clip** posts once. The server
encodes the guide with ffmpeg (libx264, CRF 10, 24 fps), submits `workflows/clip_ltx25-depth-guide.api.json`, waits,
downloads, and checks the clip with ffprobe: the requested size and exactly the guide's frame count. A clip whose
bytes come back for a different input is refused. The lab plays it looping, optionally side by side with the guide.
**Finish clip** (free) runs the still Finish on every frame and writes `finish-<clip>-<preset>.mp4` beside the
clip, which is never touched; the player toggles raw / finished.
One job runs at a time per endpoint (a second request gets 409 `busy`).

With a car on the set (Build: **Add car**, **Set path**, speed, Stop / Drive through), the clip carries a moving
world. The world has one clock, which is the Operator engine's timeline: Record rewinds it to 0 and plays it, so
every take holds the whole action, and the finished take stores the car's pose per raw sample as a `worldTrack`
(`{ objects: [{ id, kind, label, samples: [{ t, position, heading, speed, visibleFraction }] }] }`, t in seconds from
the take's first sample, the same clock as the camera samples and the guide frames). **Go to take start** also puts
the world clock at the take's first moment, so the still taken there shows the car where frame 0 has it (usually
not yet in frame). **Export guide** renders frame i with the clock at the take's start + i/24 and the car at its
recorded pose, and writes the track beside the cameras in `cameras.json` and `meta.json`. A take with nothing moving
has no track and behaves as before. The take also records the Operator view's aspect while it was recorded, and the
guide's lens and the first-frame pose check use it: the shell's Render page lays the (hidden) view out at another
aspect than Shoot, where the take and its still are made. One live run on the bank low-street set (MoGe-2): car path
~13 m from out of frame on the left to the steps, Fast, stop; a 3.8 s slow push-in at ~48 mm; the auto prompt read
"A red compact coupe drives in from the left and rolls to a stop centre-frame." The car enters on time (~1.9 s),
stops where staged and stays one consistent red coupe; clip job `212a016b`, 7 credits, 768x448, 97 frames.

## What the endpoints send

- **Location prompt.** The Location section builds a photographic prompt from a short description and three
  presets: `Photo of <first sentence>, seen from <framing>. <further sentences>. <the ground into depth>. <light>.
  <lens>, <film>.` Framing is Eye-level establishing, Looking along it or Slight low angle; light is golden hour,
  overcast, night (sodium + neon) or blue hour; lens + film is 24mm Portra 400, 28mm Cinestill 800T or 35mm Fuji Pro
  400H. Quality tags are dropped from the description. The prompt sits in an editable box with a word count and
  warnings (past 80 words, quality tags, "no X" wording, a second lens or quoted sign); whatever the box shows is
  posted, rendered and stored unchanged.
- **Location candidates.** Z-Image Turbo at 1344x768, 9 steps, CFG 1, `dpmpp_sde` / `ddim_uniform`, four seeds in
  one job. `dpmpp_sde` runs the model twice per step: one batch of four measured 6 credits (21 s execution) against
  3 for the earlier 8-step sampler. The lab's "≈4-8 credits" label covers it.
- **Still prompts.** Written as a photograph, not a render: no quality tags ("photorealistic", "8k", "masterpiece",
  "highly detailed", HDR), and they are stripped from scene prompts too. The Z-Image pass gets the shot's own prompt
  as "Photo of …", then "Natural light, true-to-life colour." and a positive-only safety line, "Plain unmarked walls
  and doors; the place is empty and quiet." The "plain unmarked walls" part is left out when the shot quotes a sign's
  words (`one reads "BAR"`). "No X" clauses and sentences are dropped, because Turbo has no working negative. The Qwen
  holes instruction is narrow: fill only the empty areas, continue the surrounding surfaces, keep everything else.
  For the Quality still, whose holes arrive pre-filled, it names no black: it calls the soft, blurred patches missing
  picture, mostly at the frame edges, to extend so the photograph fills the frame edge to edge. Told to fill "the
  black regions" of a night scene's dark blur, Qwen painted the frame-edge holes black (68 % of hole pixels on the
  alley; 1.3 % with the new wording).
- **Still graphs.** Quality: a Qwen Image Edit holes fill (20 steps, crop and stitch) on the colour view with its
  holes pre-filled by a soft pull-push blend, so Qwen never sees black holes. Then Z-Image Turbo under the depth
  ControlNet at denoise 0.55 (11 of 20 steps, exact; E21: more steps past ~6 change nothing). The test still's
  optional Repaint select (0.4 / 0.5 / 0.55 / 0.6) sets that denoise per request; the server refuses any value
  outside 0.4-0.6 or one no step count runs exactly, and refuses it on Fast. Above 0.55 objects start to change
  (E20). The Qwen fill is saved as a second output beside the still, and the ledger
  note for every structure-locked still records how many hole pixels came back black (R+G+B < 30) in the fill and
  the still. The inpaint hint stays off for Quality: at 0.4 it did not repaint a black fill (measured, 67.8 % in
  and out). Fast: Z-Image only, at denoise 0.75. A KSampler with denoise d and s steps
  runs the last s steps of a floor(s/d)-step schedule, so Fast runs 9 of 12 steps, which is exactly 0.75.
- **Settle gate.** Before a settle turn writes its folder, the server checks the depth fit against the set. The
  median depth error must be at most 10 %, at least 60 % of the overlap must survive trimming, and the scale must be
  x0.7-1.4 for a metric depth model (MoGe-2) or x1/3-3 for any other. A fit that fails is not written. The settled
  meta records the view's source, and **Load settled view** applies the same rule to folders already on disk,
  refusing with the reason. The three alley fills at x0.35-0.40 that floated in front of the set no longer load.

- **Look grade.** Qwen Image Edit 2511 (quality: 20 steps, CFG 4, `euler` / `simple`, denoise 1), with the roles
  split so a reference lends light, not geometry. `TextEncodeQwenImageEditPlus` gets the still (scaled to ~1 MP) as
  Picture 1 and the location's references as Pictures 2 and 3, with its `vae` input **disconnected**: every picture
  reaches the model only as vision-language tokens (the node downscales each to ~384² for that itself). Core
  `ReferenceLatent` then appends one reference latent, the still's, to the positive and the negative conditioning, so
  the still is the only structural reference. At denoise 1 the sampled latent is pure noise (a flow model at σ = 1),
  so the still's structure arrives through its reference latent, not the sampler's input. The result is scaled back
  to the still's exact size (`ImageScale`, crop disabled). The instruction is narrow and uses the encoder's own labels:
  "Relight and grade Picture 1 to match the lighting, contrast and colour of Picture 2. Take only the light and colour
  from Picture 2, nothing else. Keep every object, edge and the composition of Picture 1 exactly; change only the
  light, shadow, colour and atmosphere." Quoted text in the location's prompt is named as something to keep ("Keep
  the sign reading "BAR"."). The time of day is added only when it changes the still's (read off the location's
  prompt), so Night on a night still does not darken it again; atmosphere is phrased as what the air is (Fog: "Fog
  fills the air: the far distance fades into soft fog and the lights glow through it"), then "Mood: <mood>." and "Add
  nothing new." With no reference it reads "Relight and grade this photograph." A look with nothing to change is
  refused before any spend. The server refuses an output that is not the still's size or is byte-identical to an
  output made from a different input. It also guards the result: a grade whose edge correlation with the still is
  under 0.4 re-composed the frame, so it is kept in `looks/` (paid for, and the evidence) but flagged, never shown as
  the still's "after" and never the default input of Finish.
  Measured on the alley (Night, Fog, the location's own master as reference 1, seed 42; from the credit ledger):
  the first wiring, which also fed every picture to the encoder's `vae` (so the still and the master were two equal
  structural references), re-composed the alley — edge correlation 0.148, 15 credits, job `475ee119`. The current
  wiring kept the wires, the red box, the leaves, the near wall and the "BAR" sign, and brought the fog in: edge
  correlation 0.852, 10 credits, job `36183d9e`. A text-only control (same wiring, no reference) scored 0.896 for
  7 credits (job `c6afbc2b`) and looks close to it; the reference's share is a modest shift in colour.
- **Shot prompt (clip).** Written from the take, not guessed. The move is measured from the same 24 fps samples the
  guide is rendered from: net and path translation in the first frame's level camera axes, pan / tilt / roll, focal
  change, speed profile, and an orbit test. The largest component is the move; secondary ones are named only at 10 %
  or more of it. The paragraph is in time order and present tense, at most 80 words. It restates the first frame from
  the location's prompt without "Photo of", the viewpoint, lens, film, framing or quality words. Then one sentence of
  the move with its size, duration and pacing ("The camera pushes slowly forward about one and a half metres over
  three and a half seconds, easing to a stop."). Then "The scene stays still; consistent exposure, no flicker." The box
  shows it editable, and what the box shows is sent. With a moving world the take's track is read over the same
  samples: for each object in frame, which edge it enters by and when, which way it goes, how fast (crawls / rolls
  slowly / drives / speeds, from its mean speed in frame) and whether it stops in frame (in thirds) or leaves. One
  sentence per object goes before the camera sentence ("A red compact coupe drives in from the left and rolls to a
  stop centre-frame."); the scene restatement drops its claims that the place is empty ("empty", "no cars"), and the
  last line becomes "The rest of the scene stays still". A car that brakes to a stop soon after entering reads as
  "rolls slowly in", because its mean speed in frame is low.
- **Clip graph.** LTX-2.5 22B distilled image-to-video with the LTX-2.3 Union Control IC-LoRA, the graph proven in
  experiments E12 / E15: 8 distilled steps, DualCFG 1. The still and the guide are each centre-cropped to 768x448;
  the still is placed as frame 0 at strength 1, and the guide is added at frame 0 at the chosen strength (0.5-0.7,
  default 0.6; E1 found this range stops LTX copying the projection's seams but keeps the move). Upscale x2 appends
  E1c's latent upscale stage (1536x896). Price shown before Render: about 2 credits per 73 frames at 768x448, about
  8 with x2. The first live x2 job (2026-10-18) failed on Cloud in the LTX VAE loader before rendering, 0 credits;
  x2 is still unseen.
- **Look finish.** Local and free, in linear light, deterministic (the grain seed is the still's id): halation,
  bloom, edge softness, vignette and grain, ported from experiment E14. Film is E14's winning recipe; Subtle is half
  of it. Tone match maps each channel's percentiles onto the location's master still. Nothing moves; it changes tone
  and texture, never geometry. It runs on the dev server's thread (about a second for a 1344x768 still).
  There is no depth of field: leave it to the words of your prompt.
- **Clip finish.** The same finish per frame, after LTX. ffmpeg decodes the clip to RGB frames (BT.709, as LTX tags
  it), worker threads finish them (so the dev server keeps answering), and ffmpeg re-encodes them in order (libx264
  CRF 12, yuv420p, the clip's fps, tags and audio). The film finish (no depth of field) with a grain seed per frame (deterministic, never the same on two frames). The clip must have
  the guide's frame count and its size or twice it; ffprobe must show the same size, frame count and fps after, or
  the result is refused. About 1 s per second of clip at 768x448; about 10 s estimated for a 3.7 s x2 clip.

## Option 1: Comfy Cloud

1. Subscribe to a plan with API access. The free tier has none; this project used Creator ([SETUP.md](../SETUP.md)).
2. Create an API key in your Comfy workspace.
3. In `app/.env`:
   ```
   COMFY_API_KEY=<your key>
   COMFY_BASE_URL=
   ```
4. `npm run dev` from `app/`. Without a key or a base URL the Comfy endpoints answer 503 "No Comfy target".

All workflows in `app/workflows/` were run on Comfy Cloud. An inventory check of its nodes and models
(2026-10-17) found every node and model the app needs. Listed is not the same as
runnable; each workflow was still run once to confirm.

## Option 2: self-hosted ComfyUI

The SDK speaks the v2 contract, which a plain ComfyUI does not serve. `comfy-api-proxy` (Python 3.10+,
`pip install comfy-api-proxy`, tested with 0.1.6) serves it and forwards to your ComfyUI. Run it in its own venv
outside the repo:

```bash
python -m venv proxy-venv
proxy-venv/bin/pip install comfy-api-proxy          # Windows: proxy-venv/Scripts/pip
proxy-venv/bin/comfy-api-proxy run --comfyui http://127.0.0.1:8188 --port 8189
curl http://127.0.0.1:8189/api/v2/health            # {"status": "healthy", ...}
```

Then in `app/.env`:

```
COMFY_API_KEY=
COMFY_BASE_URL=http://127.0.0.1:8189
```

Notes, all from [app/scripts/README.md](../app/scripts/README.md):

- If your ComfyUI uses a private TLS certificate, point `SSL_CERT_FILE` at its root for the proxy, and run Node
  with `NODE_USE_SYSTEM_CA=1` for the scripts that read `/api/object_info` directly.
- The proxy reports no job start/end times, no job labels and no node or model listing. To see what your ComfyUI
  has installed, read its own `/api/object_info`.
- The credit ledger (below) reads the Cloud billing balance, so on a self-hosted target the cost columns stay blank.

### What your ComfyUI needs

Check your ComfyUI's `/api/object_info` for the nodes and models below. Use the model names in the README table; the loader nodes
in the workflows reference these exact filenames. Node classes beyond ComfyUI core that the workflows use:

- Crop and stitch inpainting: `InpaintCropImproved`, `InpaintStitchImproved`
- Geometry: `LoadMoGeModel`, `MoGeInference`, `MoGePointMapToMesh`, `MoGeRender`, `LoadDA3Model`, `DA3Inference`
  (on Cloud these are built in; on a self-hosted ComfyUI they may need a node pack, which this repo does not name)
- Depth preprocessors: `DepthAnythingV2Preprocessor`, `Zoe_DepthAnythingPreprocessor` (controlnet_aux)
- Saving: `SaveImageAdvanced` (32-bit EXR depth), `SaveGLB`
- LTX, Qwen Image Edit, Flux 2 and Z-Image nodes used by the workflows

Which pack provides each class on a self-hosted install is not recorded in this repo; check `python_module` in your
ComfyUI's `/api/object_info`.

Honest status: the one self-hosted ComfyUI this was tried against (inventory taken 2026-10-17, early in the
project) lacked MoGe-2, Depth Anything 3, LTX-2.5 and its text encoder, and TripoSplat (14 needs present, 2 partial, 11 missing). It had Qwen Image Edit 2511, Z-Image Turbo, Flux 2 Klein and
inpaint crop and stitch. Treat self-hosting as supported by the code, and verified only for the Z-Image
and Qwen pieces. Nobody has yet followed these steps on a clean install.

## Cost controls

- **Per-process caps.** The still, settle, location, look and clip endpoints each count submissions since the dev server
  started and answer 429 `cap` once the cap is reached. Defaults are 20 for stills and settle, 10 for location
  (one candidates job is four stills) 10 for look grades (finishes are free and not counted) and 10 for clips (guide exports are free and not counted); set
  `CANVAS_STILL_CAP`, `CANVAS_SETTLE_CAP`, `CANVAS_LOCATION_CAP`, `CANVAS_LOOK_CAP` and `CANVAS_CLIP_CAP` in `app/.env` to change them
  (positive integers). Restarting the dev server resets the count. CrossView renders (≈19 credits each, about 6x a
  clip) have their own cap, `CANVAS_CROSSVIEW_CAP`, default 6 (warp exports are free and not counted); the same
  free-hiccup retry as clips applies. `CANVAS_CROSSVIEW_LORA` names the imported CrossView-Warp LoRA if your account
  lists it under another name than the default.
- **One job at a time.** A second request to the same endpoint while one is running gets 409 `busy`. The endpoints
  do not know about each other; the projection lab page blocks Take still, auto-fill, Location, Look Grade and the clip's guide export and Render
  while another runs (including while a grade's or a clip's cost is still settling). The clip page never re-posts: on
  409 or a dropped connection it reads the result back from `GET /__lab/clip`.
- **Never resubmit.** `app/server/comfy/run.ts` says so, and the runners follow it. A submit that is lost is
  recovered by job id, not retried, because a retry is a second billed job (the app's Recover action does this).
- **One exception: Cloud's free LTX hiccup.** Comfy Cloud intermittently fails LTX jobs in node 13 (`VAELoader`) with
  "cannot unpack non-iterable MTPHead object" about 1.3 s in, and bills nothing for it (13 times in E24 / E27, all
  0 credits). The clip runner resubmits such a job, and only such a job: it failed, its error is exactly that
  signature, and it cost nothing (the attempt's settled balance drop is 0; where no balance can be read, it ran
  under 3 s with no output). It settles that attempt's cost first, waits about 2 minutes, then submits again, at
  most 3 submissions in all. Each attempt takes a clip-cap slot and gets its own `submitted` and completion rows
  (`attempt 2/3` in the note), and the page shows "Cloud hiccup — retrying (2/3)". A billed failure, any other
  error, a timeout, a lost wait or a failed download is never retried. The stills and look runners have no retry:
  their models have never hit this fault.
- **Ledger.** Every job the app submits appends to a credit ledger file under `app/experiments/`: a `submitted` row with the job id right
  after submit, then a completion row with wall seconds, execution seconds and the drop in account balance (read
  from the Cloud billing balance after a short delay; valid only if nothing else ran on the account). A
  `submitted` row with no completion row means "recover by id, do not resubmit". Error text is redacted before it is
  logged or returned.
- **Keep previews small.** The experiments used low resolution and short clips until the final render.

## Scripts

All scripts in `app/scripts/` use the same target rule (`COMFY_BASE_URL` unset = Cloud).
See [app/scripts/README.md](../app/scripts/README.md).

## Open question

The contest asks for an app built with the Comfy Developer Platform (API, Router and/or SDK). This app uses the SDK
and the Cloud API. Whether that, with workflows shipped as files in this repo rather than published to ComfyHub,
satisfies the rule is being confirmed with Comfy.
