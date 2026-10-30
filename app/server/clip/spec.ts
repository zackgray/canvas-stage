/**
 * The clip's fixed shape and price, shared by the lab (which renders the guide) and the endpoint (which checks it).
 * Pure, browser-safe.
 *   - 24 fps, 8n+1 frames (LTX's latent packs 8 frames + the first), at most 121 = 5.0 s (the take recorder's
 *     default cap), at least 9.
 *   - 768×448, the size E1/E12/E15 proved; LTX's ImageScale centre-crops both the first frame and the guide to it.
 *   - guide strength 0.5-0.7 (E1c: seams gone, move kept), default 0.6.
 */
import { dofTag } from '../look/dof-tag.ts'
import type { ClipFinishRequest, ClipUpscale } from './types.ts'

export const CLIP_FPS = 24
export const MIN_FRAMES = 9
export const MAX_FRAMES = 121
export const GUIDE_W = 768
export const GUIDE_H = 448
export const STRENGTH = { min: 0.5, max: 0.7, default: 0.6 } as const

export const is8n1 = (n: number) => Number.isInteger(n) && n >= MIN_FRAMES && n <= MAX_FRAMES && (n - 1) % 8 === 0

/** Output size of a clip: the guide size, or twice it with the x2 latent upscale. */
export const clipSize = (upscale: ClipUpscale) => (upscale === 'x2' ? { width: GUIDE_W * 2, height: GUIDE_H * 2 } : { width: GUIDE_W, height: GUIDE_H })

/**
 * Rough credits for a clip, from the ledger (experiments/credit-log.md): 73 frames at 768×448 ≈ 2 credits (E1 c1-guide05,
 * E12 orbit-s07 / orbit45-s07: 0.9-1.1 cents); with the x2 latent upscale ≈ 8 (E1c b-x2-a2-s42: 3.83 cents). Scaled
 * by frame count; never below 1.
 */
export function clipCredits(frames: number, upscale: ClipUpscale): number {
  const per73 = upscale === 'x2' ? 8 : 2
  return Math.max(1, Math.round((per73 * frames) / 73))
}

export function clipPrice(frames: number, upscale: ClipUpscale): string {
  const { width, height } = clipSize(upscale)
  const n = clipCredits(frames, upscale)
  return `≈${n} credit${n === 1 ? '' : 's'} · ${(frames / CLIP_FPS).toFixed(1)} s @ ${width}×${height}`
}

/** The id (and file name) of a clip finish: the same request always names the same file. */
export const clipFinishId = (req: Pick<ClipFinishRequest, 'clip' | 'preset' | 'grain' | 'dof'>) =>
  `finish-${req.clip}-${req.preset}${req.preset === 'off' ? '' : `-grain-${req.grain ?? 'fine'}`}${dofTag(req.dof)}`
