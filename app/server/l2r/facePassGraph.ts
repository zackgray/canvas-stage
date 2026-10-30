/**
 * The face detail pass graph, E143 arm s in ONE job (so one job id recovers it and one price covers it):
 *   1. frame -1: a Klein 4B crop/stitch redraw of the approved still's 1088 window, the face only (E141's mask under a hat's brim),
 *      from the person's own card (a copy of experiments/lib/e135-graphs.ts kleinPropRedraw at E143's options; nodes prefixed `f`).
 *   2. the window re-render: the decided L2R graph (graph.ts) at a square size (stage 1 S/2, stage 2 S, decode at S), the raw render's
 *      window as the layout on stage 1 ONLY (hold 'wide': stage 2 is the plain distilled model, so it draws the face instead of copying
 *      the raw's smear; E143 arms c and r failed exactly there), look 1.0, the Klein window wired straight in as frame -1.
 * __tests__/facePassGraph.test.ts holds this deep-equal to experiments/lib/e143-graphs.ts windowL2R (arm s) and kleinPropRedraw.
 * Binds: v.file = the raw window clip, fstill / fmaskimg / fref.image = the still's window, the face mask, the card's face.
 * Saves: save_t (the window render), fout (the redrawn face window). Pure.
 */
import type { ApiGraph } from '../comfy/index.ts'
import { FACE_WIN } from './faceSpec.ts'
import { l2rGraph } from './graph.ts'

const L = (id: string, slot = 0): [string, number] => [id, slot]
export const FACE_NODES = { win: 'v', still: 'fstill', mask: 'fmaskimg', card: 'fref', save: 'save_t', face: 'fout' } as const
/** E143's frame -1 step: no mask growth, 8 px blend, context 3.5x the mask, worked at 1024 */
export const FACE_CROP = { expand: 0, blend: 8, ctx: 3.5, target: 1024 } as const
type CropOpts = { expand: number; blend: number; ctx: number; target: number }

/** e135-graphs kleinPropRedraw without its three SaveImage nodes: image 1 = the crop, image 2 = the reference at 0.5 MP, sampled in the mask only */
export function kleinFaceRedraw(prompt: string, seed: number, o: CropOpts = FACE_CROP): ApiGraph {
  const T = o.target
  const g: ApiGraph = {
    k1: { class_type: 'UNETLoader', inputs: { unet_name: 'flux-2-klein-4b.safetensors', weight_dtype: 'default' } },
    k2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'flux2' } },
    k3: { class_type: 'VAELoader', inputs: { vae_name: 'flux2-vae.safetensors' } },
    still: { class_type: 'LoadImage', inputs: { image: 'still.png' } },
    maskimg: { class_type: 'LoadImage', inputs: { image: 'mask.png' } },
    mask: { class_type: 'ImageToMask', inputs: { image: L('maskimg'), channel: 'red' } },
    ref: { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
    refs: { class_type: 'ImageScaleToTotalPixels', inputs: { image: L('ref'), upscale_method: 'lanczos', megapixels: 0.5, resolution_steps: 16 } },
    crop: { class_type: 'InpaintCropImproved', inputs: { image: L('still'), mask: L('mask'), downscale_algorithm: 'bilinear', upscale_algorithm: 'bicubic', preresize: false, preresize_mode: 'ensure minimum resolution',
      preresize_min_width: 1024, preresize_min_height: 1024, preresize_max_width: 16384, preresize_max_height: 16384, mask_fill_holes: true, mask_expand_pixels: o.expand, mask_invert: false,
      mask_blend_pixels: o.blend, mask_hipass_filter: 0.1, extend_for_outpainting: false, extend_up_factor: 1, extend_down_factor: 1, extend_left_factor: 1, extend_right_factor: 1,
      context_from_mask_extend_factor: o.ctx, output_resize_to_target_size: true, output_target_width: T, output_target_height: T, output_padding: '32' } },
    l1: { class_type: 'VAEEncode', inputs: { pixels: L('crop', 1), vae: L('k3') } },
    l2: { class_type: 'VAEEncode', inputs: { pixels: L('refs'), vae: L('k3') } },
  }
  g.nm = { class_type: 'SetLatentNoiseMask', inputs: { samples: L('l1'), mask: L('crop', 2) } }
  g.p = { class_type: 'CLIPTextEncode', inputs: { clip: L('k2'), text: prompt } }
  g.p0 = { class_type: 'ReferenceLatent', inputs: { conditioning: L('p'), latent: L('l1') } }
  g.p1 = { class_type: 'ReferenceLatent', inputs: { conditioning: L('p0'), latent: L('l2') } }
  g.n = { class_type: 'CLIPTextEncode', inputs: { clip: L('k2'), text: '' } }
  g.n0 = { class_type: 'ReferenceLatent', inputs: { conditioning: L('n'), latent: L('l1') } }
  g.n1 = { class_type: 'ReferenceLatent', inputs: { conditioning: L('n0'), latent: L('l2') } }
  Object.assign(g, {
    ks: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    sig: { class_type: 'Flux2Scheduler', inputs: { steps: 4, width: T, height: T } },
    gd: { class_type: 'CFGGuider', inputs: { model: L('k1'), positive: L('p1'), negative: L('n1'), cfg: 1 } },
    rn: { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    sm: { class_type: 'SamplerCustomAdvanced', inputs: { noise: L('rn'), guider: L('gd'), sampler: L('ks'), sigmas: L('sig'), latent_image: L('nm') } },
    dec: { class_type: 'VAEDecode', inputs: { samples: L('sm'), vae: L('k3') } },
    st: { class_type: 'InpaintStitchImproved', inputs: { stitcher: L('crop'), inpainted_image: L('dec') } },
  })
  return g
}

/** every node id (and every [id, slot] link) of `g` renamed by `ren` */
export function renamed(g: ApiGraph, ren: (id: string) => string): ApiGraph {
  const out: ApiGraph = {}
  for (const [id, n] of Object.entries(g)) {
    const inputs: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(n.inputs as Record<string, unknown>))
      inputs[k] = Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number' ? [ren(v[0]), v[1]] : v
    out[ren(id)] = { ...n, inputs } as ApiGraph[string]
  }
  return out
}

export interface FacePassGraphInput {
  /** the window render's one-sentence close-up prompt, and the Klein face redraw's */
  prompt: string
  facePrompt: string
  seed: number
  kleinSeed: number
  /** the render's frames (8k+1) */
  frames: number
  /** SaveVideo / SaveImage filename_prefix stem */
  prefix: string
  size?: number
}

export function facePassGraph(i: FacePassGraphInput): ApiGraph {
  const size = i.size ?? FACE_WIN, half = size / 2
  if (half % 32) throw new Error('the face window must be a multiple of 64 px')
  const g = l2rGraph({ prompt: i.prompt, seed: i.seed, frames: i.frames, prefix: i.prefix, hold: 'wide' })
  Object.assign(g.vs.inputs as object, { width: half, height: half })
  Object.assign(g.e_t.inputs as object, { width: half, height: half })
  Object.assign(g.sc_t.inputs as object, { width: size, height: size })
  // frame -1 is the Klein redraw itself, not an uploaded file: drop the loader and point its guides at the stitch
  delete g.k_t
  const out = renamed(g, (id) => (id === 'k_t' ? 'fst' : id))
  Object.assign(out, renamed(kleinFaceRedraw(i.facePrompt, i.kleinSeed), (id) => `f${id}`))
  out[FACE_NODES.face] = { class_type: 'SaveImage', inputs: { images: L('fst'), filename_prefix: `${i.prefix}-face` } }
  return out
}

/** [node, field, file] for runJob */
export const facePassBinds = (f: { win: string; still: string; mask: string; card: string }): [string, string, string][] =>
  [[FACE_NODES.win, 'file', f.win], [FACE_NODES.still, 'image', f.still], [FACE_NODES.mask, 'image', f.mask], [FACE_NODES.card, 'image', f.card]]
