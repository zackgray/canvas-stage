/**
 * API-format graphs for the Stills lab, built in code (the still_*.api.json files are snapshots of these, kept in
 * sync by a unit test). Wiring follows the official Comfy-Org "Image Edit (Qwen-Image 2511)" template subgraph:
 *   UNETLoader -> ModelSamplingAuraFlow(3.1) -> CFGNorm(1) [-> Lightning LoRA] -> KSampler
 *   TextEncodeQwenImageEditPlus(prompt, image1) -> FluxKontextMultiReferenceLatentMethod(index_timestep_zero)
 *   for positive and (empty prompt) negative; VAEEncode(image) -> latent; denoise 1.
 * Input inputs confirmed against Cloud object_info (2026-10-17).
 */
import type { StillMode, StillVariant } from './types.ts'

export type ApiNode = { class_type: string; inputs: Record<string, unknown> }
export type ApiGraph = Record<string, ApiNode>

export const QWEN = {
  unet: 'qwen_image_edit_2511_fp8mixed.safetensors',
  clip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
  vae: 'qwen_image_vae.safetensors',
  lightning: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
} as const

export const SAMPLING: Record<StillMode, { steps: number; cfg: number; lora: boolean }> = {
  quality: { steps: 20, cfg: 4, lora: false },
  fast: { steps: 4, cfg: 1, lora: true },
}

/** Node ids the runner binds or reads. */
export const NODES = { image: '1', mask: '2', sampler: '40', save: '90' } as const

export interface GraphOptions {
  variant: StillVariant
  mode: StillMode
  prompt: string
  seed: number
  /** loader filenames; the runner rebinds them to uploaded assets */
  image?: string
  mask?: string
  prefix?: string
}

const link = (id: string, slot = 0): [string, number] => [id, slot]

/** Model chain + text encoders + sampler, fed by `pixels` (the image the edit sees). Returns the decoded image link. */
function qwenEdit(g: ApiGraph, o: GraphOptions, pixels: [string, number], latent: [string, number]): [string, number] {
  const s = SAMPLING[o.mode]
  g['30'] = { class_type: 'UNETLoader', inputs: { unet_name: QWEN.unet, weight_dtype: 'default' } }
  g['31'] = { class_type: 'ModelSamplingAuraFlow', inputs: { model: link('30'), shift: 3.1 } }
  g['32'] = { class_type: 'CFGNorm', inputs: { model: link('31'), strength: 1 } }
  let model = link('32')
  if (s.lora) {
    g['33'] = { class_type: 'LoraLoaderModelOnly', inputs: { model: link('32'), lora_name: QWEN.lightning, strength_model: 1 } }
    model = link('33')
  }
  g['34'] = { class_type: 'CLIPLoader', inputs: { clip_name: QWEN.clip, type: 'qwen_image', device: 'default' } }
  g['35'] = { class_type: 'VAELoader', inputs: { vae_name: QWEN.vae } }
  g['36'] = { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: link('34'), prompt: o.prompt, vae: link('35'), image1: pixels } }
  g['37'] = { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: link('34'), prompt: '', vae: link('35'), image1: pixels } }
  g['38'] = { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: link('36'), reference_latents_method: 'index_timestep_zero' } }
  g['39'] = { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: link('37'), reference_latents_method: 'index_timestep_zero' } }
  g[NODES.sampler] = {
    class_type: 'KSampler',
    inputs: {
      model, seed: o.seed, steps: s.steps, cfg: s.cfg, sampler_name: 'euler', scheduler: 'simple',
      positive: link('38'), negative: link('39'), latent_image: latent, denoise: 1,
    },
  }
  g['41'] = { class_type: 'VAEDecode', inputs: { samples: link(NODES.sampler), vae: link('35') } }
  return link('41')
}

/** Whole-frame edit: the image is scaled to ~1 MP (aspect kept, multiples of 16) and fully re-rendered. */
function fullGraph(o: GraphOptions): ApiGraph {
  const g: ApiGraph = {}
  g[NODES.image] = { class_type: 'LoadImage', inputs: { image: o.image ?? 'INPUT.png' } }
  g['10'] = { class_type: 'ImageScaleToTotalPixels', inputs: { image: link(NODES.image), upscale_method: 'lanczos', megapixels: 1, resolution_steps: 16 } }
  g['20'] = { class_type: 'VAEEncode', inputs: { pixels: link('10'), vae: link('35') } }
  const out = qwenEdit(g, o, link('10'), link('20'))
  g[NODES.save] = { class_type: 'SaveImage', inputs: { images: out, filename_prefix: o.prefix ?? 'canvas-stage/still' } }
  return g
}

/**
 * Holes only (as E3): crop around the hole mask, repaint inside the (8 px grown) mask, stitch back with blend 0,
 * so every pixel outside the mask stays bit-exact.
 */
function holesGraph(o: GraphOptions): ApiGraph {
  const g: ApiGraph = {}
  g[NODES.image] = { class_type: 'LoadImage', inputs: { image: o.image ?? 'INPUT.png' } }
  g[NODES.mask] = { class_type: 'LoadImageMask', inputs: { image: o.mask ?? 'MASK.png', channel: 'red' } }
  g['3'] = {
    class_type: 'InpaintCropImproved',
    inputs: {
      image: link(NODES.image), mask: link(NODES.mask), downscale_algorithm: 'bilinear', upscale_algorithm: 'bicubic',
      preresize: false, preresize_mode: 'ensure minimum resolution', preresize_min_width: 1024, preresize_min_height: 1024,
      preresize_max_width: 16384, preresize_max_height: 16384, mask_fill_holes: false, mask_expand_pixels: 0,
      mask_invert: false, mask_blend_pixels: 0, mask_hipass_filter: 0.1, extend_for_outpainting: false,
      extend_up_factor: 1, extend_down_factor: 1, extend_left_factor: 1, extend_right_factor: 1,
      context_from_mask_extend_factor: 1.2, output_resize_to_target_size: false, output_target_width: 1024,
      output_target_height: 1024, output_padding: '32',
    },
  }
  g['4'] = { class_type: 'GrowMask', inputs: { mask: link('3', 2), expand: 8, tapered_corners: true } }
  g['20'] = { class_type: 'VAEEncode', inputs: { pixels: link('3', 1), vae: link('35') } }
  g['21'] = { class_type: 'SetLatentNoiseMask', inputs: { samples: link('20'), mask: link('4') } }
  const out = qwenEdit(g, o, link('3', 1), link('21'))
  g['42'] = { class_type: 'InpaintStitchImproved', inputs: { stitcher: link('3'), inpainted_image: out } }
  g[NODES.save] = { class_type: 'SaveImage', inputs: { images: link('42'), filename_prefix: o.prefix ?? 'canvas-stage/still' } }
  return g
}

export function buildStillGraph(o: GraphOptions): ApiGraph {
  return o.variant === 'holes' ? holesGraph(o) : fullGraph(o)
}

/** Every link in the graph points at a node that exists (cheap structural check for tests). */
export function danglingLinks(g: ApiGraph): string[] {
  const bad: string[] = []
  for (const [id, n] of Object.entries(g)) {
    for (const [k, v] of Object.entries(n.inputs)) {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number' && !g[v[0]]) {
        bad.push(`${id}.${k} -> ${v[0]}`)
      }
    }
  }
  return bad
}
