/**
 * Cast graph (API format). Snapshot in workflows/cast_front_zit.api.json (a test keeps it in step).
 *  frontGraph  Z-Image Turbo (E18 recipe: shift 3, dpmpp_sde / ddim_uniform, 9 steps, CFG 1, zeroed negative): N seeds
 *              in one job -> node "s<k>" saves candidate k. Cheap, so the owner picks from a few.
 * Never the 40-step Qwen-Image T2I (E33: 34 cr).
 */
import type { ApiGraph } from '../comfy/index.ts'

const L = (id: string, slot = 0): [string, number] => [id, slot]
export const FRONT_SIZE = { width: 832, height: 1472 }

export function frontGraph(prompt: string, seeds: number[], prefix = 'canvas-stage/cast-front'): ApiGraph {
  const g: ApiGraph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    '4': { class_type: 'ModelSamplingAuraFlow', inputs: { model: L('1'), shift: 3 } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: L('2'), text: prompt } },
    '6': { class_type: 'ConditioningZeroOut', inputs: { conditioning: L('5') } },
  }
  seeds.forEach((seed, k) => {
    Object.assign(g, {
      [`l${k}`]: { class_type: 'EmptySD3LatentImage', inputs: { ...FRONT_SIZE, batch_size: 1 } },
      [`k${k}`]: { class_type: 'KSampler', inputs: { model: L('4'), positive: L('5'), negative: L('6'), latent_image: L(`l${k}`), seed, steps: 9, cfg: 1, sampler_name: 'dpmpp_sde', scheduler: 'ddim_uniform', denoise: 1 } },
      [`d${k}`]: { class_type: 'VAEDecode', inputs: { samples: L(`k${k}`), vae: L('3') } },
      [`s${k}`]: { class_type: 'SaveImage', inputs: { images: L(`d${k}`), filename_prefix: `${prefix}-${seed}` } },
    })
  })
  return g
}

/** The snapshot written to workflows/: placeholder prompt, fixed seeds. */
export const SNAPSHOT_FRONT = () => frontGraph('<front prompt>', [1, 2, 3])
