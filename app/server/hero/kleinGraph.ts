/**
 * The Klein finish of a kit still: FLUX.2 Klein 4B distilled (4 steps, cfg 1, 1920x1088), the drawn still as image 1 at 1 MP and
 * every other reference (face, gear, the Bible's master, material references) at its own size, one ReferenceLatent per image.
 * A copy of experiments/lib/e104-graphs.ts heroSized() over e100-graphs.ts hero(), as the E118/E126 card step ran it.
 */
import type { ApiGraph } from '../comfy/index.ts'
import { HERO_H, HERO_W } from './spec.ts'

const L = (id: string, slot = 0): [string, number] => [id, slot]

/** one still: its key (graph-safe), seed, the loader keys of its references in image order, and its prompt */
export interface KleinStill { id: string; seed: number; refs: string[]; prompt: string }

/** `files`: loader key -> uploaded file name; `mp`: loader key -> megapixels (absent = 1 MP) */
export function buildKleinGraph(list: KleinStill[], prefix: string, files: Record<string, string>, mp: Record<string, number>): ApiGraph {
  const g: ApiGraph = {
    k1: { class_type: 'UNETLoader', inputs: { unet_name: 'flux-2-klein-4b.safetensors', weight_dtype: 'default' } },
    k2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'flux2' } },
    k3: { class_type: 'VAELoader', inputs: { vae_name: 'flux2-vae.safetensors' } },
    ks: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    c: { class_type: 'Flux2Scheduler', inputs: { steps: 4, width: HERO_W, height: HERO_H } },
    l: { class_type: 'EmptyFlux2LatentImage', inputs: { width: HERO_W, height: HERO_H, batch_size: 1 } },
    n: { class_type: 'CLIPTextEncode', inputs: { clip: L('k2'), text: '' } },
  }
  for (const k of Object.keys(files)) Object.assign(g, {
    [k]: { class_type: 'LoadImage', inputs: { image: files[k] } },
    [`${k}_s`]: { class_type: 'ImageScaleToTotalPixels', inputs: { image: L(k), upscale_method: 'lanczos', megapixels: mp[k] ?? 1, resolution_steps: 16 } },
    [`${k}_l`]: { class_type: 'VAEEncode', inputs: { pixels: L(`${k}_s`), vae: L('k3') } },
  })
  for (const s of list) {
    let p = `p_${s.id}`, n = 'n'
    g[p] = { class_type: 'CLIPTextEncode', inputs: { clip: L('k2'), text: s.prompt } }
    s.refs.forEach((k, i) => {
      g[`${p}_r${i}`] = { class_type: 'ReferenceLatent', inputs: { conditioning: L(p), latent: L(`${k}_l`) } }; p = `${p}_r${i}`
      g[`n_${s.id}_r${i}`] = { class_type: 'ReferenceLatent', inputs: { conditioning: L(n), latent: L(`${k}_l`) } }; n = `n_${s.id}_r${i}`
    })
    Object.assign(g, {
      [`g_${s.id}`]: { class_type: 'CFGGuider', inputs: { model: L('k1'), positive: L(p), negative: L(n), cfg: 1 } },
      [`r_${s.id}`]: { class_type: 'RandomNoise', inputs: { noise_seed: s.seed } },
      [`x_${s.id}`]: { class_type: 'SamplerCustomAdvanced', inputs: { noise: L(`r_${s.id}`), guider: L(`g_${s.id}`), sampler: L('ks'), sigmas: L('c'), latent_image: L('l') } },
      [`d_${s.id}`]: { class_type: 'VAEDecode', inputs: { samples: L(`x_${s.id}`), vae: L('k3') } },
      [kleinSaveNode(s.id)]: { class_type: 'SaveImage', inputs: { images: L(`d_${s.id}`), filename_prefix: `${prefix}-${s.id}` } },
    })
  }
  return g
}

export const kleinSaveNode = (key: string) => `o_${key}`
