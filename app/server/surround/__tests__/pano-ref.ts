// The reference chain that made the 590011 world (wave-a-recipe-diag.md), frozen here because its sources are not in the
// repo's tracked tree (experiments/*.ts and public/lab-assets are untracked / ignored). Transcribed node for node from:
//  - generation: 639b4bf server/surround/graph.ts (the pre-W1A Lightning graph) as job 26a66d86 ran it; its prompt is that
//    batch's record (locations/loc-2026-10-21T16-10-47-105/surround-candidates/2026-10-21T16-12-30-997.json `prompt`);
//  - harmonise: experiments/e57_cloud.ts --arm opt2, branch d45 (job b5ba73c0); prompt = experiments/e57/opt2.json `prompt`;
//  - seam: experiments/e59_cloud.ts --arm prep, the seam branch (seed 590011); prompt = experiments/e59/prep.json seam.prompt.
import type { ApiGraph } from '../../comfy/index.ts'

const L = (id: string, slot = 0): [string, number] => [id, slot]
const NEG = 'seam, border, frame, picture frame, framed photo, poster, text, watermark, people, person, persons, human figure, standing figure, pedestrian, photographer, camera operator, tripod, silhouette, shadow of a person, long shadow of a photographer, blurry, distorted horizon, tilted horizon, duplicate sun, low quality'
const PLACE = 'a muddy medieval battlefield at dusk, smoke drifting across trampled grass, a burning wooden palisade, broken spears and fallen banners in the mud, low heavy clouds, firelight on the smoke'
const DUSK = 'Dusk: a deep blue sky with dark clouds, a low orange sun glowing through smoke ahead, orange firelight on the smoke, the ground dark and in shadow.'

/** E57's PLACE constant (e57_cloud.ts / e59_cloud.ts) */
export const E57_PLACE = PLACE
/** job 26a66d86's recorded prompt, verbatim */
export const REF_GENERATE_PROMPT = '360 degree panorama with equirectangular projection, a photograph taken standing in one place: a muddy medieval battlefield at dusk, smoke drifting across trampled grass, a burning wooden palisade, broken spears and fallen banners in the mud, low heavy clouds, firelight on the smoke. The light is the same as in the photograph: the same sun or lamps, the same colour and mood, continuing round the viewer. The same place continues all the way around the viewer, behind as well as ahead, level horizon, natural photographic detail, deep focus.'
/** E57 opt2.json `prompt` (= E59 prep.json seam.prompt), verbatim */
export const REF_HARMONISE_PROMPT = '360 degree panorama with equirectangular projection, a photograph taken standing in one place: a muddy medieval battlefield at dusk, smoke drifting across trampled grass, a burning wooden palisade, broken spears and fallen banners in the mud, low heavy clouds, firelight on the smoke. Dusk: a deep blue sky with dark clouds, a low orange sun glowing through smoke ahead, orange firelight on the smoke, the ground dark and in shadow. The same place continues all the way around the viewer, behind as well as ahead, level horizon, natural photographic detail, deep focus.'

/** The live test location's meta (loc-2026-10-22T13-56-07-249, a byte copy of 571's still): its shot and lighting line. */
export const BATTLEFIELD_META = {
  lighting: DUSK,
  result: { shot: {
    description: 'medieval battlefield (panorama)',
    prompt: `A photograph taken standing in one place: ${PLACE}. ${DUSK} Natural photographic detail, fine sharp texture in the grass, mud and wood, level horizon, deep focus.`,
  } },
}

const loaders = (prompt: string): ApiGraph => ({
  m1: { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_2512_bf16.safetensors', weight_dtype: 'default' } },
  m2: { class_type: 'LoraLoaderModelOnly', inputs: { model: L('m1'), lora_name: 'qwen-360-diffusion-2512-int8-bf16-v2.safetensors', strength_model: 1 } },
  c1: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' } },
  v1: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
  n: { class_type: 'CLIPTextEncode', inputs: { clip: L('c1'), text: NEG } },
  p: { class_type: 'CLIPTextEncode', inputs: { clip: L('c1'), text: prompt } },
})

/** 639b4bf buildSurroundGraph, one seed (job 26a66d86 ran seeds 1115151017 and 941482904; 941482904 is the world's base) */
export function refGenerate(seed: number): ApiGraph {
  return {
    ...loaders(REF_GENERATE_PROMPT),
    m3: { class_type: 'LoraLoaderModelOnly', inputs: { model: L('m2'), lora_name: 'Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors', strength_model: 1 } },
    m4: { class_type: 'ModelSamplingAuraFlow', inputs: { model: L('m3'), shift: 3.1 } },
    img: { class_type: 'LoadImage', inputs: { image: 'canvas.png' } },
    msk: { class_type: 'LoadImage', inputs: { image: 'mask.png' } },
    mm: { class_type: 'ImageToMask', inputs: { image: L('msk'), channel: 'red' } },
    enc: { class_type: 'VAEEncode', inputs: { pixels: L('img'), vae: L('v1') } },
    lat: { class_type: 'SetLatentNoiseMask', inputs: { samples: L('enc'), mask: L('mm') } },
    [`k_${seed}`]: { class_type: 'KSampler', inputs: { model: L('m4'), seed, steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', positive: L('p'), negative: L('n'), latent_image: L('lat'), denoise: 1 } },
    [`d_${seed}`]: { class_type: 'VAEDecode', inputs: { samples: L(`k_${seed}`), vae: L('v1') } },
    [`o_${seed}`]: { class_type: 'SaveImage', inputs: { images: L(`d_${seed}`), filename_prefix: `canvas-stage/surround-${seed}` } },
  }
}

/** e57_cloud.ts --arm opt2, the d45 branch (in.png = base.png: seed 941482904 + the still pasted) */
export const refHarmonise = (): ApiGraph => ({
  ...loaders(REF_HARMONISE_PROMPT),
  m4: { class_type: 'ModelSamplingAuraFlow', inputs: { model: L('m2'), shift: 3.1 } },
  img: { class_type: 'LoadImage', inputs: { image: 'in.png' } },
  enc: { class_type: 'VAEEncode', inputs: { pixels: L('img'), vae: L('v1') } },
  k_d45: { class_type: 'KSampler', inputs: { model: L('m4'), seed: 57002, steps: 20, cfg: 4, sampler_name: 'euler', scheduler: 'simple', positive: L('p'), negative: L('n'), latent_image: L('enc'), denoise: 0.45 } },
  d_d45: { class_type: 'VAEDecode', inputs: { samples: L('k_d45'), vae: L('v1') } },
  o_d45: { class_type: 'SaveImage', inputs: { images: L('d_d45'), filename_prefix: 'canvas-stage/e57-opt2-d45' } },
})

/** e59_cloud.ts --arm prep, the seam branch (rolled.png = opt2-d45-raw rolled 50 %); the detail branch is not in the chain */
export function refSeam(): ApiGraph {
  const { p, ...rest } = loaders(REF_HARMONISE_PROMPT)
  return {
    ...rest,
    m4: { class_type: 'ModelSamplingAuraFlow', inputs: { model: L('m2'), shift: 3.1 } },
    p360: p,
    si: { class_type: 'LoadImage', inputs: { image: 'rolled.png' } },
    sm: { class_type: 'LoadImage', inputs: { image: 'seam-mask.png' } },
    smm: { class_type: 'ImageToMask', inputs: { image: L('sm'), channel: 'red' } },
    se: { class_type: 'VAEEncode', inputs: { pixels: L('si'), vae: L('v1') } },
    sl: { class_type: 'SetLatentNoiseMask', inputs: { samples: L('se'), mask: L('smm') } },
    k_seam: { class_type: 'KSampler', inputs: { model: L('m4'), seed: 590011, steps: 20, cfg: 4, sampler_name: 'euler', scheduler: 'simple', positive: L('p360'), negative: L('n'), latent_image: L('sl'), denoise: 0.8 } },
    d_seam: { class_type: 'VAEDecode', inputs: { samples: L('k_seam'), vae: L('v1') } },
    o_seam: { class_type: 'SaveImage', inputs: { images: L('d_seam'), filename_prefix: 'canvas-stage/e59-seam' } },
  }
}

/**
 * Every reference node against the app graph, after renaming (`ids`: ref id -> app id). `stand` = reference inputs the app
 * makes in-graph instead of loading (ref id -> the app node standing in; only links to it are checked). SaveImage nodes and
 * the `seed` input are skipped (the app's seeds are random; 590011 / 57002 were the seam / harmonise seeds only).
 * Returns the differences, [] when the chain is the same.
 */
export function diffChain(ref: ApiGraph, app: ApiGraph, ids: Record<string, string>, stand: Record<string, string> = {}): string[] {
  const to = (id: string) => stand[id] ?? ids[id] ?? id
  const out: string[] = []
  for (const [rid, node] of Object.entries(ref)) {
    if (node.class_type === 'SaveImage' || rid in stand) continue
    const aid = to(rid), a = app[aid]
    if (!a) { out.push(`${rid} -> ${aid}: missing`); continue }
    if (a.class_type !== node.class_type) out.push(`${aid}: class ${a.class_type} != ${node.class_type}`)
    const keys = new Set([...Object.keys(node.inputs), ...Object.keys(a.inputs)].filter((k) => k !== 'seed'))
    for (const k of keys) {
      const rv = node.inputs[k], av = a.inputs[k]
      const want = Array.isArray(rv) && typeof rv[0] === 'string' ? [to(rv[0]), rv[1]] : rv
      if (JSON.stringify(want) !== JSON.stringify(av)) out.push(`${aid}.${k}: ${JSON.stringify(av)} != ${JSON.stringify(want)}`)
    }
  }
  return out
}
