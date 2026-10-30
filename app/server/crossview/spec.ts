/**
 * The CrossView render's fixed shape, price and file layout, shared by the lab (which exports the warp) and the endpoint
 * (which checks it). Pure, browser-safe.
 *   - 960×544 (E29: ≈ the LoRA's 768² training area at 16:9, both sides /32), 24 fps.
 *   - 8n+1 frames (LTX packs 8 frames + the first): 9 up to CANVAS_CROSSVIEW_MAX_FRAMES (default 193, request.ts). 121 is the
 *     length proven by E29-E34; longer is a test (PROVEN_FRAMES).
 *   - holes are pure magenta (255, 0, 255): the convention the CrossView-Warp LoRA was trained on.
 * A warp folder (renders/warp-<stamp>/) is written by the lab through /__lab/save:
 *   warp/warp_NNN.png   the lifted performance re-seen from the take's camera, holes pure magenta, 960×544 RGB(A)
 *   cameras.json        WarpCameras (types.ts): every frame's camera, holes: 'magenta', the pack and source window
 * and the server adds warp.mp4 + source.mp4 (what was sent) and crossview-<stamp>.mp4/.json per render.
 */
import { MIN_FRAMES } from '../clip/spec.ts'

export { MIN_FRAMES }
/** the longest take the experiments proved (5 s); anything above is a test, and the UI says so */
export const PROVEN_FRAMES = 121
/** CANVAS_CROSSVIEW_MAX_FRAMES when unset or invalid */
export const DEFAULT_MAX_FRAMES = 193
/** the hard ceiling for the env value and for any graph (the Lift's MAX_FRAMES, src/project/performance.ts) */
export const ABSOLUTE_MAX_FRAMES = 289
/** 8n+1 and 9 <= n <= max */
export const is8n1Upto = (n: number, max: number) => Number.isInteger(n) && n >= MIN_FRAMES && n <= max && (n - 1) % 8 === 0
/** longer than the length the experiments proved */
export const isLongTake = (frames: number) => frames > PROVEN_FRAMES
export const CROSSVIEW_W = 960
export const CROSSVIEW_H = 544
export const CROSSVIEW_FPS = 24
export const MAGENTA = [255, 0, 255] as const
/** the warp frames' sub-folder and file name of frame i */
export const WARP_DIR = 'warp'
export const warpFrameName = (i: number) => `warp_${String(i).padStart(3, '0')}.png`

const FOLDER_RE = /^warp-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/
const PACK_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/** A warp folder the lab wrote (also the path-safety check for requests). */
export const isWarpFolder = (name: string) => FOLDER_RE.test(name)
/** A performance pack id: its folder under /lab-assets/performances/ (also the path-safety check). */
export const isPackId = (id: string) => PACK_RE.test(id)

/**
 * Rough credits for one CrossView render, from E29's ledger (experiments/credit-log.md, 960×544, LTX-2.3): a single
 * 97-frame job (661b900a) ≈ 19 credits; five warps in one job (deac87aa) ≈ 68. So ≈ 7 to load the 22B model + Gemma
 * and ≈ 12 per 97 frames of sampling, scaled by frame count.
 */
export function crossViewCredits(frames: number): number {
  return Math.round(7 + (12.25 * frames) / 97)
}

export function crossViewPrice(frames: number): string {
  return `≈${crossViewCredits(frames)} credits · ${(frames / CROSSVIEW_FPS).toFixed(1)} s @ ${CROSSVIEW_W}×${CROSSVIEW_H}`
}

/** The LoRA's trigger: E29's prompts were "Crossview." + one scene sentence. Added once if the prompt lacks it. */
export const TRIGGER = 'Crossview.'
export const withTrigger = (prompt: string) => (/^crossview\b/i.test(prompt.trim()) ? prompt.trim() : `${TRIGGER} ${prompt.trim()}`)
