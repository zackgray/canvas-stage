/**
 * The hero-still graph: E99/E100's distilled FLUX.2 Klein 4B edit (4 steps, cfg 1, 1920x1088), one ReferenceLatent per
 * reference image, one SaveImage per still. A pure copy of experiments/lib/e100-graphs.ts hero() (that file is an
 * experiment; the server does not import it). Reference 1 is the take's opening frame, reference 2 the cast face card.
 */
import type { ApiGraph } from '../comfy/index.ts'
import { HERO_H, HERO_W, NODES, saveNode } from './spec.ts'

const L = (id: string, slot = 0): [string, number] => [id, slot]

export interface HeroPick { id: string; seed: number }
export interface HeroGraphOpts { prompt: string; picks: HeroPick[]; prefix: string; steps?: number; /** the face card's size (default 1 MP, as the frame) */ faceMegapixels?: number }

/** Loader node `k` with its megapixel scale and VAE encode (the reference latent of image `k`). */
function loader(g: ApiGraph, k: string, file: string, megapixels = 1) {
  Object.assign(g, {
    [k]: { class_type: 'LoadImage', inputs: { image: file } },
    [`${k}_s`]: { class_type: 'ImageScaleToTotalPixels', inputs: { image: L(k), upscale_method: 'lanczos', megapixels, resolution_steps: 16 } },
    [`${k}_l`]: { class_type: 'VAEEncode', inputs: { pixels: L(`${k}_s`), vae: L('k3') } },
  })
}

export function buildHeroGraph(o: HeroGraphOpts): ApiGraph {
  const g: ApiGraph = {
    k1: { class_type: 'UNETLoader', inputs: { unet_name: 'flux-2-klein-4b.safetensors', weight_dtype: 'default' } },
    k2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'flux2' } },
    k3: { class_type: 'VAELoader', inputs: { vae_name: 'flux2-vae.safetensors' } },
    ks: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    c: { class_type: 'Flux2Scheduler', inputs: { steps: o.steps ?? 4, width: HERO_W, height: HERO_H } },
    l: { class_type: 'EmptyFlux2LatentImage', inputs: { width: HERO_W, height: HERO_H, batch_size: 1 } },
    n: { class_type: 'CLIPTextEncode', inputs: { clip: L('k2'), text: '' } },
  }
  loader(g, NODES.opening, 'opening.png')
  loader(g, NODES.face, 'face.png', o.faceMegapixels ?? 1)
  const refs = [NODES.opening, NODES.face]
  for (const s of o.picks) {
    const key = s.id.replace(/[^\w]/g, '_')
    let p = `p_${key}`, n = 'n'
    g[p] = { class_type: 'CLIPTextEncode', inputs: { clip: L('k2'), text: o.prompt } }
    refs.forEach((k, i) => {
      g[`${p}_r${i}`] = { class_type: 'ReferenceLatent', inputs: { conditioning: L(p), latent: L(`${k}_l`) } }; p = `${p}_r${i}`
      g[`n_${key}_r${i}`] = { class_type: 'ReferenceLatent', inputs: { conditioning: L(n), latent: L(`${k}_l`) } }; n = `n_${key}_r${i}`
    })
    Object.assign(g, {
      [`g_${key}`]: { class_type: 'CFGGuider', inputs: { model: L('k1'), positive: L(p), negative: L(n), cfg: 1 } },
      [`r_${key}`]: { class_type: 'RandomNoise', inputs: { noise_seed: s.seed } },
      [`x_${key}`]: { class_type: 'SamplerCustomAdvanced', inputs: { noise: L(`r_${key}`), guider: L(`g_${key}`), sampler: L('ks'), sigmas: L('c'), latent_image: L('l') } },
      [`d_${key}`]: { class_type: 'VAEDecode', inputs: { samples: L(`x_${key}`), vae: L('k3') } },
      [saveNode(s.id)]: { class_type: 'SaveImage', inputs: { images: L(`d_${key}`), filename_prefix: `${o.prefix}-${key}` } },
    })
  }
  return g
}
