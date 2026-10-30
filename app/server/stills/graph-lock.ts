/**
 * Structure-locked still: Z-Image Turbo img2img from the (hole-filled) colour view, steered by our exact stage
 * depth through the Z-Image Fun ControlNet Union 2.1 (ZImageFunControlnet, which also takes the colour view as its
 * inpaint image + the hole mask, so it knows which pixels are missing). Partial denoise keeps the composition;
 * the depth control keeps the geometry where the colour gives no help (the holes). Output is cropped back to the
 * export's exact size. Wiring follows the official Comfy-Org "Depth to Image (Z-Image-Turbo)" blueprint
 * (UNET -> ControlNet patch -> ModelSamplingAuraFlow 3 -> KSampler res_multistep/simple, CFG 1, zeroed negative);
 * node inputs confirmed against Cloud object_info (2026-10-17).
 */
import type { ApiGraph, GraphOptions } from './graph.ts'
import { buildStillGraph, NODES } from './graph.ts'

export const ZIMAGE = {
  unet: 'z_image_turbo_bf16.safetensors',
  clip: 'qwen_3_4b.safetensors',
  vae: 'ae.safetensors',
  patch: 'Z-Image-Turbo-Fun-Controlnet-Union-2.1-2601-8steps.safetensors',
} as const

/**
 * Settings picked by the still-lock experiment (experiments/still-lock_result.md): alone (fast mode) the pass needs
 * a high denoise to repaint the pull-push smears. After the Qwen holes fill (quality mode) 0.4 was enough to lock;
 * 0.55 is the default since E20/E21 (cleaner signs and materials, objects kept; 11 steps, more steps add nothing).
 */
export const LOCK = {
  fast: { strength: 0.8, denoise: 0.75 },
  combo: { strength: 0.7, denoise: 0.55 },
  /** the distilled 8-step schedule the patch is built for; the step count actually run comes from lockSteps */
  steps: 8,
} as const

/**
 * The denoise a KSampler really runs: with denoise d and s steps it builds a floor(s/d)-step schedule and runs its
 * last s steps (comfy/samplers.py), so the effective denoise is s/floor(s/d) — quantised by the schedule (E17).
 */
export const effectiveDenoise = (steps: number, d: number): number => (d >= 1 ? 1 : steps / Math.floor(steps / d))

/**
 * Step count nearest the 8-step schedule whose effective denoise is the requested one (E17's zSteps). At a flat 8
 * steps 0.75 runs as 0.8, and 0.9/0.95 run the full schedule (pure noise: structure only).
 */
export function lockSteps(d: number, near: readonly number[] = [8, 7, 9, 6, 10, 11, 12, 5]): number {
  if (d >= 0.9999) return near[0]
  for (const s of near) if (Math.abs(effectiveDenoise(s, d) - d) < 0.002) return s
  throw new Error(`no step count near ${LOCK.steps} runs denoise ${d} exactly`)
}

/**
 * The Quality still's optional Repaint setting = the lock pass's denoise (default LOCK.combo.denoise). Above 0.55
 * objects start to change (E20); every offered value runs exactly (lockSteps). The server refuses anything else.
 */
export const REPAINT = { min: 0.4, max: 0.6, options: [0.4, 0.5, 0.55, 0.6] } as const

/** A requested repaint, or a user-readable Error: a finite number inside REPAINT's range that runs exactly. */
export function checkRepaint(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < REPAINT.min || v > REPAINT.max) {
    throw new Error(`repaint must be a number from ${REPAINT.min} to ${REPAINT.max}`)
  }
  try { lockSteps(v) } catch { throw new Error(`repaint ${v} cannot run exactly; use one of ${REPAINT.options.join(', ')}`) }
  return v
}

/** Node ids the runner binds or reads (image/mask/save shared with graph.ts); `fill` saves the combo's Qwen stitch. */
export const LOCK_NODES = { depth: '5', sampler: '60', fill: '91' } as const

export interface LockOptions {
  prompt: string
  seed: number
  /** export size; the padded inputs are cropped back to this */
  width: number
  height: number
  strength?: number
  denoise?: number
  /** pass the colour + hole mask to the ControlNet as an inpaint hint (off when the holes are already filled) */
  inpaint?: boolean
  image?: string
  mask?: string
  depth?: string
  prefix?: string
}

const link = (id: string, slot = 0): [string, number] => [id, slot]

/**
 * Adds the Z-Image structure-locked pass to `g`, reading colour from `pixels`. Returns the cropped image link.
 * Ids 50-63 are used.
 */
export function addLockPass(g: ApiGraph, o: LockOptions, pixels: [string, number]): [string, number] {
  const inpaint = o.inpaint ?? true
  const denoise = o.denoise ?? LOCK.fast.denoise
  g[LOCK_NODES.depth] = { class_type: 'LoadImage', inputs: { image: o.depth ?? 'DEPTH.png' } }
  g['50'] = { class_type: 'UNETLoader', inputs: { unet_name: ZIMAGE.unet, weight_dtype: 'default' } }
  g['51'] = { class_type: 'CLIPLoader', inputs: { clip_name: ZIMAGE.clip, type: 'lumina2', device: 'default' } }
  g['52'] = { class_type: 'VAELoader', inputs: { vae_name: ZIMAGE.vae } }
  g['53'] = { class_type: 'ModelPatchLoader', inputs: { name: ZIMAGE.patch } }
  g['54'] = {
    class_type: 'ZImageFunControlnet',
    inputs: {
      model: link('50'), model_patch: link('53'), vae: link('52'), strength: o.strength ?? LOCK.fast.strength,
      image: link(LOCK_NODES.depth),
      ...(inpaint ? { inpaint_image: pixels, mask: link(NODES.mask) } : {}),
      start_percent: 0, end_percent: 1,
    },
  }
  g['55'] = { class_type: 'ModelSamplingAuraFlow', inputs: { model: link('54'), shift: 3 } }
  g['56'] = { class_type: 'CLIPTextEncode', inputs: { clip: link('51'), text: o.prompt } }
  g['57'] = { class_type: 'ConditioningZeroOut', inputs: { conditioning: link('56') } }
  g['58'] = { class_type: 'VAEEncode', inputs: { pixels, vae: link('52') } }
  g[LOCK_NODES.sampler] = {
    class_type: 'KSampler',
    inputs: {
      model: link('55'), seed: o.seed, steps: lockSteps(denoise), cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple',
      positive: link('56'), negative: link('57'), latent_image: link('58'), denoise,
    },
  }
  g['61'] = { class_type: 'VAEDecode', inputs: { samples: link(LOCK_NODES.sampler), vae: link('52') } }
  g['62'] = { class_type: 'ImageCrop', inputs: { image: link('61'), width: o.width, height: o.height, x: 0, y: 0 } }
  return link('62')
}

/** Structure-locked render straight from the prepped export (holes pull-push filled, depth-controlled). */
export function buildLockGraph(o: LockOptions): ApiGraph {
  const g: ApiGraph = {}
  g[NODES.image] = { class_type: 'LoadImage', inputs: { image: o.image ?? 'INPUT.png' } }
  if (o.inpaint ?? true) g[NODES.mask] = { class_type: 'LoadImageMask', inputs: { image: o.mask ?? 'MASK.png', channel: 'red' } }
  const out = addLockPass(g, o, link(NODES.image))
  g[NODES.save] = { class_type: 'SaveImage', inputs: { images: out, filename_prefix: o.prefix ?? 'canvas-stage/still' } }
  return g
}

/**
 * Combo: Qwen holes-only fill (crop + stitch, bit-exact outside the mask), then the structure-locked pass at a
 * lower denoise for one consistent photographic finish. One job.
 * Inputs are the PREPPED colour (holes pull-push filled) and mask, padded like the depth, so the stitched fill
 * already lines up with the depth control and the crop takes the pad off. Qwen must not see black holes: given a
 * large black region touching the frame edge (an outside-the-set wedge) it keeps it as a black border (E18 bank
 * 20°: 65 % of hole pixels came back black). On a night scene that blend is itself dark, and told to fill "the
 * black regions" Qwen still painted the frame edge black (R-01), so its instruction names no black (prompts.ts).
 * The locked pass cannot recover a black fill at 0.4, inpaint hint or not (measured), so node 91 saves the fill.
 */
export function buildComboGraph(holes: GraphOptions, lock: LockOptions): ApiGraph {
  const g = buildStillGraph({ ...holes, variant: 'holes' })
  delete g[NODES.save]
  const out = addLockPass(g, { inpaint: false, ...LOCK.combo, ...lock }, link('42'))
  const prefix = lock.prefix ?? holes.prefix ?? 'canvas-stage/still'
  g[NODES.save] = { class_type: 'SaveImage', inputs: { images: out, filename_prefix: prefix } }
  // the Qwen fill on its own (padded size), so a bad still says which stage went wrong (R-01)
  g[LOCK_NODES.fill] = { class_type: 'SaveImage', inputs: { images: link('42'), filename_prefix: `${prefix}-fill` } }
  return g
}
