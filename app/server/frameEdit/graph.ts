/**
 * The "Edit this frame" graph: Qwen-Image-Edit 2511 with the Lightning 8-step LoRA (CFG 1) and ONE reference picture — the still the
 * edit starts from — at 1344x768, scaled back to 1920x1088. A copy, node for node, of the graph the qa-2026-10-28-qwen-abilities test
 * ran (scripts/edit.ts there; removal, recolour, one small addition, fog and darker all passed the owner's eye — do not improve it).
 * No Klein, no ControlNet depth, no extra references: those are the draw-from-master press's graph (hero/editGraph.ts), not this.
 * Bind FRAME_EDIT_IMAGE_NODE's `image` field to the version's PNG.
 */
import type { ApiGraph } from '../comfy/index.ts'
import { HERO_H, HERO_W } from '../hero/spec.ts'
import { EDIT_H, EDIT_W } from '../hero/editSpec.ts'

/** the single LoadImage node: the still the edit starts from */
export const FRAME_EDIT_IMAGE_NODE = 'a'
export const frameEditSaveNode = (seed: number) => `s${seed}`

export interface FrameEditGraphOpts { prompt: string; seed: number; prefix: string }

export function buildFrameEditGraph(o: FrameEditGraphOpts): ApiGraph {
  const W = EDIT_W, H = EDIT_H
  const g: ApiGraph = {
    m1: { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_edit_2511_bf16.safetensors', weight_dtype: 'default' } },
    m1l: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['m1', 0], lora_name: 'Qwen-Image-Edit-2511-Lightning-8steps-V1.0-fp32.safetensors', strength_model: 1 } },
    m2: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['m1l', 0], shift: 3.1 } },
    m3: { class_type: 'CFGNorm', inputs: { model: ['m2', 0], strength: 1 } },
    m4: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' } },
    m5: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
    a: { class_type: 'LoadImage', inputs: { image: 'A.png' } },
    a_s: { class_type: 'ImageScale', inputs: { image: ['a', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'disabled' } },
    pos: { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['m4', 0], prompt: o.prompt, image1: ['a_s', 0] } },
    neg: { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['m4', 0], prompt: '', image1: ['a_s', 0] } },
    lat: { class_type: 'EmptySD3LatentImage', inputs: { width: W, height: H, batch_size: 1 } },
    a_l: { class_type: 'VAEEncode', inputs: { pixels: ['a_s', 0], vae: ['m5', 0] } },
    a_rp: { class_type: 'ReferenceLatent', inputs: { conditioning: ['pos', 0], latent: ['a_l', 0] } },
    a_rn: { class_type: 'ReferenceLatent', inputs: { conditioning: ['neg', 0], latent: ['a_l', 0] } },
    mp: { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['a_rp', 0], reference_latents_method: 'index_timestep_zero' } },
    mn: { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['a_rn', 0], reference_latents_method: 'index_timestep_zero' } },
  }
  g[`k${o.seed}`] = { class_type: 'KSampler', inputs: { model: ['m3', 0], seed: o.seed, steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', positive: ['mp', 0], negative: ['mn', 0], latent_image: ['lat', 0], denoise: 1 } }
  g[`v${o.seed}`] = { class_type: 'VAEDecode', inputs: { samples: [`k${o.seed}`, 0], vae: ['m5', 0] } }
  g[`u${o.seed}`] = { class_type: 'ImageScale', inputs: { image: [`v${o.seed}`, 0], upscale_method: 'lanczos', width: HERO_W, height: HERO_H, crop: 'disabled' } }
  g[frameEditSaveNode(o.seed)] = { class_type: 'SaveImage', inputs: { images: [`u${o.seed}`, 0], filename_prefix: `${o.prefix}-${o.seed}` } }
  return g
}
