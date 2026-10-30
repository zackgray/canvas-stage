/**
 * The decided Layout-To-Render graph (docs/method-review-2026-10-22.md): a COPY of app/experiments/tune/graph.ts `tuneGraph`
 * at its Lightricks defaults, so the server never imports the experiment runners (tuneGraph pulls lib/e95-run.ts, which drags
 * in the experiment ledger and the Comfy runner). __tests__/graph.test.ts asserts this builds a graph deep-equal to
 * tuneGraph(DEFAULTS) for the same inputs; change both or neither.
 *   LTX-2.5 22B distilled + IC-LoRA Layout-To-Render on both stages; stage 1 960x544, 8 distilled sigmas, euler_ancestral,
 *   CFG 1; x2 latent upsampler; stage 2 1920x1088 at 0.909375, 0.725, 0.421875, 0; the look still as frame -1; layout and
 *   look strength 1.0; the 1920 clay straight to stage 2 (`layoutSize`); optional mid / end keyframe guides chained after the
 *   look still on both stages (tune/graph.ts addKeys), none by default.
 * Binds: v.file = the clay video, k_t.image = the approved still, km_t / ke_t.image = the mid / end stills. Output node: save_t. Pure.
 */
import type { ApiGraph } from '../comfy/index.ts'
import { l2rLora, L2R_LORA_DEFAULT } from './graphLora.ts'
import type { HoldPreset } from '../../src/shared/renderFinishContract.ts'

/** the default LoRA name; the name in use is l2rLora() (CANVAS_L2R_LORA overrides). A per-user Cloud import is not in shared object_info: runJob's allowModels */
export const L2R_LORA = L2R_LORA_DEFAULT

const L = (id: string, slot = 0): [string, number] => [id, slot]
const A = 't'
const S1 = '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0'
/** tune/settings.ts stage2Sigmas(0.909375) */
const S2 = '0.909375, 0.725, 0.421875, 0.0'
const STRENGTH = 1

export const L2R_NODES = { clay: 'v', still: `k_${A}`, mid: `km_${A}`, end: `ke_${A}`, save: `save_${A}` } as const

/** one keyframe guide as sent: the clay frame (an 8-frame-grid index) and the guide strength */
export interface GraphKey { frame: number; strength: number }
export type GraphKeys = { mid?: GraphKey | null; end?: GraphKey | null }

export interface L2RGraphInput {
  prompt: string
  seed: number
  /** 8k+1, the clay's frames */
  frames: number
  /** the clay's pixel size; 1920 wide goes to stage 2 as is */
  layoutSize?: { w: number; h: number }
  /** SaveVideo filename_prefix stem (the node adds `-t`) */
  prefix: string
  /** optional mid / end keyframe guides (absent = none: the graph is the plain opening-still graph) */
  keys?: GraphKeys
  /** 'closeup' (default, as before): the clay guides both stages. 'wide': stage 1 only, stage 2 runs the plain distilled model so the set cannot be re-fitted to the clay (E142 A vs B; tuneGraph guide 's1') */
  hold?: HoldPreset
}

export function l2rGraph(i: L2RGraphInput): ApiGraph {
  const g: ApiGraph = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: 'ltx-2.5-22b-distilled-transformer-bf16.safetensors', weight_dtype: 'default' } },
    ic: { class_type: 'LTXICLoRALoaderModelOnly', inputs: { model: L('unet'), lora_name: l2rLora(), strength_model: 1 } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: 'ltx-2.5-video-vae-bf16.safetensors' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: 'gemma4-12b-with-proj-ltx-2.5-bf16.safetensors', type: 'ltxv', device: 'default' } },
    ups: { class_type: 'LatentUpscaleModelLoader', inputs: { model_name: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors' } },
    neg: { class_type: 'CLIPTextEncode', inputs: { clip: L('clip'), text: '' } },
    v: { class_type: 'LoadVideo', inputs: { file: 'layout.mp4' } },
    vc: { class_type: 'GetVideoComponents', inputs: { video: L('v') } },
    vs: { class_type: 'ImageScale', inputs: { image: L('vc'), upscale_method: 'lanczos', width: 960, height: 544, crop: 'disabled' } },
    p0: { class_type: 'CLIPTextEncode', inputs: { clip: L('clip'), text: i.prompt } },
    cp0: { class_type: 'LTXVConditioning', inputs: { positive: L('p0'), negative: L('neg'), frame_rate: 24 } },
  }
  const guide = (pos: [string, number], neg: [string, number], latent: [string, number], image: [string, number], frame: number, ldf: [string, number] | number, crop: string, strength = STRENGTH) =>
    ({ class_type: 'LTXAddVideoICLoRAGuide', inputs: { positive: pos, negative: neg, vae: L('vae'), latent, image, frame_idx: frame, strength, latent_downscale_factor: ldf, crop, use_tiled_encode: false, tile_size: 256, tile_overlap: 64 } })
  const sampler = (k: string, gd: string, sigmas: string, model = 'ic') => Object.assign(g, {
    [`gd${k}`]: { class_type: 'CFGGuider', inputs: { model: L(model), positive: L(gd, 0), negative: L(gd, 1), cfg: 1 } },
    [`nz${k}`]: { class_type: 'RandomNoise', inputs: { noise_seed: i.seed } },
    [`ks${k}`]: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral' } },
    [`sg${k}`]: { class_type: 'ManualSigmas', inputs: { sigmas } },
    [`sm${k}`]: { class_type: 'SamplerCustomAdvanced', inputs: { noise: L(`nz${k}`), guider: L(`gd${k}`), sampler: L(`ks${k}`), sigmas: L(`sg${k}`), latent_image: L(gd, 2) } },
    [`cr${k}`]: { class_type: 'LTXVCropGuides', inputs: { positive: L(gd, 0), negative: L(gd, 1), latent: L(`sm${k}`, 0) } },
  })
  // stage-2 clay: the clip itself when it is 1920x1088, a scaled copy when it is 1920+ wide but another size, else the 960 copy
  const ls = i.layoutSize, hiRes = !!ls && ls.w >= 1920
  if (hiRes && !(ls.w === 1920 && ls.h === 1088)) g.vh = { class_type: 'ImageScale', inputs: { image: L('vc'), upscale_method: 'lanczos', width: 1920, height: 1088, crop: 'disabled' } }
  const clay2 = hiRes ? (g.vh ? L('vh') : L('vc')) : L('vs')
  const keys = (['mid', 'end'] as const).flatMap((n) => (i.keys?.[n] ? [{ n, k: i.keys[n] as GraphKey }] : []))
  for (const { n } of keys) g[`k${n[0]}_${A}`] = { class_type: 'LoadImage', inputs: { image: `${A}-${n}.png` } }
  /** keyframes chain after the look-still guide, on each stage; returns the last guide node */
  const addKeys = (stage: '1' | '2', last: string): string => keys.reduce((prev, { n, k }) => {
    const id = `${n[0]}${stage}_${A}`
    g[id] = guide(L(prev, 0), L(prev, 1), L(prev, 2), L(`k${n[0]}_${A}`), k.frame, stage === '1' ? L('ic', 1) : 1, 'center', k.strength)
    return id
  }, last)
  const c = 'cp0', a = A
  g[`k_${a}`] = { class_type: 'LoadImage', inputs: { image: `${a}-look.png` } }
  g[`e_${a}`] = { class_type: 'EmptyLTXVLatentVideo', inputs: { width: 960, height: 544, length: i.frames, batch_size: 1 } }

  // stage 1 (960x544, 8 distilled sigmas): layout at frame 0, the look still at frame -1
  g[`g1_${a}`] = guide(L(c, 0), L(c, 1), L(`e_${a}`), L('vs'), 0, L('ic', 1), 'disabled')
  g[`g2_${a}`] = guide(L(`g1_${a}`, 0), L(`g1_${a}`, 1), L(`g1_${a}`, 2), L(`k_${a}`), -1, L('ic', 1), 'center')
  sampler(`1_${a}`, addKeys('1', `g2_${a}`), S1)
  g[`up_${a}`] = { class_type: 'LTXVLatentUpsampler', inputs: { samples: L(`cr1_${a}`, 2), upscale_model: L('ups'), vae: L('vae') } }

  // stage 2 (x2 upsample, 1920x1088): a wide hold has no layout guide here (the plain model keeps the drawn set), a close-up has it
  if (i.hold === 'wide') g[`h2_${a}`] = guide(L(c, 0), L(c, 1), L(`up_${a}`), L(`k_${a}`), -1, 1, 'center')
  else {
    g[`h1_${a}`] = guide(L(c, 0), L(c, 1), L(`up_${a}`), clay2, 0, 1, 'disabled')
    g[`h2_${a}`] = guide(L(`h1_${a}`, 0), L(`h1_${a}`, 1), L(`h1_${a}`, 2), L(`k_${a}`), -1, 1, 'center')
  }
  sampler(`2_${a}`, addKeys('2', `h2_${a}`), S2, i.hold === 'wide' ? 'unet' : 'ic')

  Object.assign(g, {
    [`dec_${a}`]: { class_type: 'VAEDecodeTiled', inputs: { samples: L(`cr2_${a}`, 2), vae: L('vae'), tile_size: 512, overlap: 64, temporal_size: 128, temporal_overlap: 32 } },
    [`sc_${a}`]: { class_type: 'ImageScale', inputs: { image: L(`dec_${a}`), upscale_method: 'lanczos', width: 1920, height: 1088, crop: 'disabled' } },
    [`cv_${a}`]: { class_type: 'CreateVideo', inputs: { images: L(`sc_${a}`), fps: 24 } },
    [`save_${a}`]: { class_type: 'SaveVideo', inputs: { video: L(`cv_${a}`), filename_prefix: `${i.prefix}-${a}`, format: 'auto', 'format.codec': 'auto' } },
  })
  return g
}

/** [node, field, file] for runJob: the clay video, the approved still, then the mid / end stills when keyframes are set */
export const l2rBinds = (clayFile: string, stillFile: string, keyFiles: { mid?: string; end?: string } = {}): [string, string, string][] =>
  [[L2R_NODES.clay, 'file', clayFile], [L2R_NODES.still, 'image', stillFile],
    ...(['mid', 'end'] as const).flatMap((n): [string, string, string][] => (keyFiles[n] ? [[L2R_NODES[n], 'image', keyFiles[n] as string]] : []))]
