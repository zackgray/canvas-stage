/**
 * The edit of "Draw from your approved frame" (draw-from-master plan section 2.1 step C): Qwen-Image-Edit 2511 with the Lightning
 * 8-step LoRA (CFG 1), three reference pictures (1 = the empty-set plate at the output size so it maps 1:1, 2 = the approved look
 * frame at 1 MP, 3 = the card's face at 1 MP), and the Fun ControlNet Union on the conditioning with the angle's full control depth
 * at 0.35 from 0 to 40 %. A copy, node for node, of qa-2026-10-27-reference-draw/round2-qwen-edit/out/edit-B-1mp.graph.json (the
 * validated graph; do not improve it) with the node ids kept, except the per-seed nodes, which are named as the Qwen draw's are
 * (k<seed>, v<seed>, u<seed>, s<seed>) so the outputs bind the same way. There is no text negative: the validated negative is the
 * empty-prompt encode of the same three pictures. Bind EDIT_NODES' `image` fields to the four PNGs.
 */
import type { ApiGraph } from '../comfy/index.ts'
import { HERO_H, HERO_W } from './spec.ts'
import { EDIT_DEPTH_END, EDIT_DEPTH_STRENGTH, EDIT_H, EDIT_W } from './editSpec.ts'
import { QWEN_UNION_CN } from './qwenGraph.ts'

/** the four LoadImage nodes: the plate, the look frame, the card's face, the control depth */
export const EDIT_NODES = { plate: 'p', look: 'a', face: 'f', depth: 'd' } as const
export const editSaveNode = (seed: number) => `s${seed}`

export interface EditOpts { prompt: string; seeds: number[]; prefix: string }

export function buildEditGraph(o: EditOpts): ApiGraph {
  const W = EDIT_W, H = EDIT_H
  const g: ApiGraph = {
    m1: { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_edit_2511_bf16.safetensors', weight_dtype: 'default' } },
    m1l: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['m1', 0], lora_name: 'Qwen-Image-Edit-2511-Lightning-8steps-V1.0-fp32.safetensors', strength_model: 1 } },
    m2: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['m1l', 0], shift: 3.1 } },
    m3: { class_type: 'CFGNorm', inputs: { model: ['m2', 0], strength: 1 } },
    m4: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' } },
    m5: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
    p: { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
    p_s: { class_type: 'ImageScale', inputs: { image: ['p', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'disabled' } },
    a: { class_type: 'LoadImage', inputs: { image: 'A.png' } },
    a_s: { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['a', 0], upscale_method: 'lanczos', megapixels: 1, resolution_steps: 16 } },
    f: { class_type: 'LoadImage', inputs: { image: 'card.png' } },
    f_s: { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['f', 0], upscale_method: 'lanczos', megapixels: 1, resolution_steps: 16 } },
    pos: { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['m4', 0], prompt: o.prompt, image1: ['p_s', 0], image2: ['a_s', 0], image3: ['f_s', 0] } },
    neg: { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['m4', 0], prompt: '', image1: ['p_s', 0], image2: ['a_s', 0], image3: ['f_s', 0] } },
    lat: { class_type: 'EmptySD3LatentImage', inputs: { width: W, height: H, batch_size: 1 } },
    p_l: { class_type: 'VAEEncode', inputs: { pixels: ['p_s', 0], vae: ['m5', 0] } },
    p_rp: { class_type: 'ReferenceLatent', inputs: { conditioning: ['pos', 0], latent: ['p_l', 0] } },
    p_rn: { class_type: 'ReferenceLatent', inputs: { conditioning: ['neg', 0], latent: ['p_l', 0] } },
    a_l: { class_type: 'VAEEncode', inputs: { pixels: ['a_s', 0], vae: ['m5', 0] } },
    a_rp: { class_type: 'ReferenceLatent', inputs: { conditioning: ['p_rp', 0], latent: ['a_l', 0] } },
    a_rn: { class_type: 'ReferenceLatent', inputs: { conditioning: ['p_rn', 0], latent: ['a_l', 0] } },
    f_l: { class_type: 'VAEEncode', inputs: { pixels: ['f_s', 0], vae: ['m5', 0] } },
    f_rp: { class_type: 'ReferenceLatent', inputs: { conditioning: ['a_rp', 0], latent: ['f_l', 0] } },
    f_rn: { class_type: 'ReferenceLatent', inputs: { conditioning: ['a_rn', 0], latent: ['f_l', 0] } },
    mp: { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['f_rp', 0], reference_latents_method: 'index_timestep_zero' } },
    mn: { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['f_rn', 0], reference_latents_method: 'index_timestep_zero' } },
    d: { class_type: 'LoadImage', inputs: { image: 'depth.png' } },
    d_s: { class_type: 'ImageScale', inputs: { image: ['d', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'disabled' } },
    ucn: { class_type: 'ControlNetLoader', inputs: { control_net_name: QWEN_UNION_CN } },
    cn: { class_type: 'ControlNetApplyAdvanced', inputs: { positive: ['mp', 0], negative: ['mn', 0], control_net: ['ucn', 0], image: ['d_s', 0],
      strength: EDIT_DEPTH_STRENGTH, start_percent: 0, end_percent: EDIT_DEPTH_END, vae: ['m5', 0] } },
  }
  for (const seed of o.seeds) {
    g[`k${seed}`] = { class_type: 'KSampler', inputs: { model: ['m3', 0], seed, steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', positive: ['cn', 0], negative: ['cn', 1], latent_image: ['lat', 0], denoise: 1 } }
    g[`v${seed}`] = { class_type: 'VAEDecode', inputs: { samples: [`k${seed}`, 0], vae: ['m5', 0] } }
    g[`u${seed}`] = { class_type: 'ImageScale', inputs: { image: [`v${seed}`, 0], upscale_method: 'lanczos', width: HERO_W, height: HERO_H, crop: 'disabled' } }
    g[editSaveNode(seed)] = { class_type: 'SaveImage', inputs: { images: [`u${seed}`, 0], filename_prefix: `${o.prefix}-${seed}` } }
  }
  return g
}
