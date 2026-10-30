# Scripts

Node 22+, run from `app/` with `npx tsx`. All Comfy access is server-side (`server/comfy/`); keys never reach
browser code.

## Choosing a Comfy target

Workflows run through `@comfyorg/sdk` (Comfy API v2), so the same code hits either target:

| Target | Env |
|---|---|
| Comfy Cloud | `COMFY_API_KEY=comfyui-...`, `COMFY_BASE_URL` unset |
| Self-hosted ComfyUI | `COMFY_BASE_URL=http://127.0.0.1:8189` (a `comfy-api-proxy`), `COMFY_API_KEY` unset |

### Self-hosted: comfy-api-proxy in front of your own ComfyUI

`comfy-api-proxy` (Python ≥ 3.10, `pip install comfy-api-proxy`, tested 0.1.6) serves the v2 contract the SDK
speaks and forwards to a plain ComfyUI. Keep it in its own venv outside the repo (`https://your-comfyui` stands
for your ComfyUI's URL):

```bash
python -m venv <venv-dir>                       # outside the repo
<venv-dir>/Scripts/pip install comfy-api-proxy   # bin/ instead of Scripts/ on macOS / Linux
<venv-dir>/Scripts/comfy-api-proxy run --comfyui https://your-comfyui --port 8189
# check: curl http://127.0.0.1:8189/api/v2/health  ->  {"status": "healthy", "upstream": "https://your-comfyui"}
```

If your ComfyUI uses a self-signed cert (e.g. Caddy's local CA), put that root in the OS trust store so Python
(the proxy) verifies it with no flags, or point `SSL_CERT_FILE` at the root.
The proxy has no `--insecure` option.

Proxy limits seen: no job start/end timestamps (scripts report wall-clock seconds instead), no job labels, and
**no node or model listing** — the v2 contract has none. To see what your ComfyUI has installed, read its
`/api/object_info` directly. For a self-signed cert, run Node with `NODE_USE_SYSTEM_CA=1` (trusts the OS store; preferred).


## Python

The app runs ONE Python for everything local it does: Render's free finish (grade, sharpen, grain), the hero still's colour
match, the face detail pass and the massing clay of built pieces. Set it up as
[SETUP.md step 1](../../SETUP.md#1-tools-on-your-machine) says: a venv outside the repo,
`pip install -r scripts/requirements.txt` (everything) or `scripts/requirements-core.txt` (OpenCV + numpy: the finish only),
`python scripts/check_python.py` to list what imports, and `CANVAS_PYTHON` in `app/.env` set to that venv's python (empty = the
python on your PATH; `LIFT_PYTHON`, the older name, still works). The dev server logs what is missing at start.

The research tools below (lift, Place matte, Finish depth, the creep check, the Realism guides) are not in the shipped chain
and need more than that: torch (CUDA, a GPU with >= 8 GB), SAM2, MoGe, rtmlib and Pillow, installed by hand into a venv you
name with `LIFT_PYTHON` when you run them (it may be the same venv).

## lift-performance.ts — a locked-off performance clip into a set (local, 0 credits)

```bash
LIFT_PYTHON=<venv>/Scripts/python npx tsx scripts/lift-performance.ts --clip <mp4> --location <loc id> \
  --id <pack id> --label "<label>" --prompt-json <json with "prompt"> \
  --box x0,y0,x1,y1 --box … [--point x,y --point …] [--width 960] [--work <dir>] [--redo]
```

Writes a performance pack (format and parser: `src/project/performance.ts`) to
`public/lab-assets/performances/<id>/`: stabilised colour, actor-only planar depth (16-bit, set metres), SAM actor
masks, the stabilised `source.mp4` (H.264 4:4:4 CRF 4, CrossView's reference), the clean plate and `lift.json` (the
registration, creep fit, crop, per-frame depth scale and residual), and adds the pack to
`public/lab-assets/performances/index.json` (the list the lab reads). The clip must be shot from the location's
camera (an I2V clip from the set's still): frame 0 is registered to the still and refused under 200 ORB inliers.

The background match keeps the actors out by their **SAM masks** (run on the unstabilised frames, dilated 1.25 % of the width;
`--exclusion masks[:dilate]`, default), not a grown box: close framings (fighters at 60-67 % of the frame height) left the old
box (`--exclusion boxes[:margin]`, margin 0.5) ~90 % of the frame and failed at 8 inliers. What was used and how much of the
frame it covered is recorded in `lift.json` `exclusion`. The lift also writes `source1920.mp4` (the same maps, resampled once
from the full-size frames at 1920 wide) beside `source.mp4`. In the app, Perform > Lift runs this as a child process (needs
`LIFT_PYTHON` in the environment or `.env.local`).

No black border: removing the clip's creep (a ~5 % zoom in E29) leaves each frame short of the set's edges. The lift
keeps the centred, set-aspect rectangle that every stabilised frame covers (4 px in, for the resampler), resampled
from the full-size clip to the pack size (a 1920 master loses no resolution at a 960 pack), and checks that every
pixel of every frame is covered. The pack's `source` camera is the set's projector with the field of view narrowed to
match (tan(vfov/2) scaled by the crop; warehouse-fight: 94.2 %, 50.38° -> 47.79°), so the pack still registers to the
set; MoGe runs with that narrower FOV and the depth scale is fitted against the set's depth under the same crop.

The set behind the performance (t29): the lift also writes the plate's own depth, `background_depth.png` (16-bit
planar, on the location's 16-bit metric scale; the manifest's `backgroundDepth`) — per pixel the median of the lift's
scaled MoGe depth over the frames where that pixel is clean (the plate colour's rule), so plate, set and actors come
from one depth model in one camera. The lab builds the set from it while the performance is on its location (Shoot:
"Set from the performance's own plate", on by default). A pack lifted before this has none; backfill it from the lift's
cached work dir (free, no model runs; refuses a work dir whose plate is not the pack's):

```bash
npx tsx scripts/pack-plate-depth.ts --id <pack id> --work <lift work dir>
```

Boxes (one per actor) and optional points (one per box) are SAM prompts on **frame 0** in pack pixels (`--width` ×
the set's aspect) of the clip as shot, before the crop (the lift moves them into the cropped frame). Pick them from the first frame, e.g. `ffmpeg -i clip.mp4 -frames:v 1 -vf scale=960:-1 f0.png`.
Steps are cached in the work dir (default: the OS temp folder); `--redo` starts over.

Python setup: see [§Python](#python) below. Models download from Hugging Face on first use: `facebook/sam2.1-hiera-small` (Apache-2.0) and
`Ruicheng/moge-2-vitl-normal` (MIT). MoGe runs locally here; with no local GPU, MoGe-2 is also on Comfy Cloud
(the Location pick graph), at ≈ 0.3 credit a frame — not wired into this tool.

Typecheck: `npx tsc -p scripts/tsconfig.json`.
