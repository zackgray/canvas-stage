/**
 * The depth-locked draw: Qwen-Image 2512 held to the clay's depth by Qwen's own Fun ControlNet Union (E130: layout 0.58-0.63 and
 * the figures at their clay size, where the DiffSynth patch scored 0.28 and drew the hero 4x too large), 50 steps, CFG 4,
 * 1664x944, one KSampler per seed. A copy of experiments/lib/e130-groups.ts build() for its winning arm (`union`, depth alone,
 * strength 0.95, start 0, end 1, now the 'tight' preset; a still passes its own, E139: 0.65 released at 0.50; the server never imports experiments), at the app's size and steps, plus one node per seed the
 * experiment ran locally: a Lanczos ImageScale to 1920x1088 before the save, so the still is the size Klein and LTX take.
 * The control sits on the conditioning (ControlNetApplyAdvanced after pos/neg); ModelSamplingAuraFlow takes the UNet directly.
 * Also draws the Bible's master (master.ts). Bind QWEN_NODES.depth's image to the near-bright depth PNG.
 */
import type { ApiGraph } from '../comfy/index.ts'
import { HERO_H, HERO_W } from './spec.ts'
import { QWEN_H, QWEN_STEPS, QWEN_W } from './kitSpec.ts'
import { LOCK_PRESETS } from './lockPresets.ts'
import { statedStyle } from '../prompt/style.ts'

/** the negative's quality items, each with whether it is a photo-look item (dropped when the prompt states another medium) */
const NEG_ITEMS: readonly [string, boolean][] = [['低分辨率', false], ['低画质', false], ['肢体畸形', false], ['手指畸形', false], ['画面过饱和', false],
  ['蜡像感', true], ['人脸无细节', false], ['过度光滑', true], ['画面具有AI感', true]]
const NEG_TAIL = '。构图混乱。文字模糊，扭曲'
/** added to the negative for a picture with nobody in it (the master): person, people, passer-by, crowd */
export const QWEN_NEG_PEOPLE = '，人物，人，行人，人群'

/**
 * The draw's negative: low resolution, low quality, deformed limbs and fingers, over-saturated, faces without detail, messy
 * composition, blurry or distorted text; plus the photo-look items (waxy, over-smooth, an AI look) unless the picture is `styled`
 * (its prompt states a medium: prompt/style.ts), where they would push it back to a photograph; plus the people part. (owner 10-29)
 * The "a second person" part a one-person still used to add is gone with the alone line it backed.
 */
export function qwenNegative(o: { styled?: boolean; noPeople?: boolean } = {}): string {
  const items = NEG_ITEMS.filter(([, photo]) => !(photo && o.styled)).map(([w]) => w).join('，')
  return `${items}${NEG_TAIL}${o.noPeople ? QWEN_NEG_PEOPLE : ''}`
}
/** each negative item in English, for the press's "What will be sent" only (never sent: the model reads the Chinese) */
const NEG_EN: Record<string, string> = { 低分辨率: 'low resolution', 低画质: 'low quality', 肢体畸形: 'deformed limbs', 手指畸形: 'deformed fingers',
  画面过饱和: 'oversaturated', 蜡像感: 'waxy look', 人脸无细节: 'faces without detail', 过度光滑: 'overly smooth', 画面具有AI感: 'looks AI-generated' }
/** where the negative comes from, said beside it */
export const QWEN_NEG_SOURCE = "Qwen's own recommended negative prompt"

/** the negative `qwenNegative(o)` sends, in English: the same items in the same order */
export function qwenNegativeEnglish(o: { styled?: boolean; noPeople?: boolean } = {}): string {
  const items = NEG_ITEMS.filter(([, photo]) => !(photo && o.styled)).map(([w]) => NEG_EN[w])
  const all = [...items, 'cluttered composition', 'blurry or distorted text', ...(o.noPeople ? ['people, a person, passers-by, a crowd'] : [])]
  return `${all.join(', ').replace(/^./, (c) => c.toUpperCase())}`
}
/** the English of the negative a draw of `prompt` sends */
export const drawNegativeEnglish = (o: Pick<QwenOpts, 'prompt' | 'noPeople' | 'styled'>): string => qwenNegativeEnglish({ styled: o.styled ?? statedStyle(o.prompt), noPeople: o.noPeople })
/** the negative a draw of `prompt` sends: the one function the graph and the press preview ("What will be sent") both read */
export const drawNegative = (o: Pick<QwenOpts, 'prompt' | 'noPeople' | 'styled'>): string => qwenNegative({ styled: o.styled ?? statedStyle(o.prompt), noPeople: o.noPeople })
/** the photograph's negative, as every draw sent it before the style flag (the concept graph still reads it) */
export const QWEN_NEG = qwenNegative()
export const QWEN_UNION_CN = 'Qwen-Image-2512-Fun-Controlnet-Union-2602.safetensors'
export const QWEN_NODES = { depth: 'd' } as const
export const qwenSaveNode = (seed: number) => `s${seed}`

/** `strength` and `end` (the control's end_percent): unset = the tight lock (0.95 to the end); a still passes its preset's (lockPresets.ts) */
export interface QwenOpts { prompt: string; seeds: number[]; prefix: string; strength?: number; end?: number; steps?: number
  /** the master: a person in the picture is in the negative too (run 4) */
  noPeople?: boolean
  /** the prompt states a picture medium; unset = read from the prompt (prompt/style.ts statedStyle) */
  styled?: boolean }

export function buildQwenDepthGraph(o: QwenOpts): ApiGraph {
  const W = QWEN_W, H = QWEN_H, strength = o.strength ?? LOCK_PRESETS.tight.strength, end = o.end ?? LOCK_PRESETS.tight.end
  const g: ApiGraph = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_2512_fp8_e4m3fn.safetensors', weight_dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
    neg: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: drawNegative(o) } },
    lat: { class_type: 'EmptySD3LatentImage', inputs: { width: W, height: H, batch_size: 1 } },
    pos: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: o.prompt } },
    d: { class_type: 'LoadImage', inputs: { image: 'depth.png' } },
    ds: { class_type: 'ImageScale', inputs: { image: ['d', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'disabled' } },
    ucn: { class_type: 'ControlNetLoader', inputs: { control_net_name: QWEN_UNION_CN } },
    cn: { class_type: 'ControlNetApplyAdvanced', inputs: { positive: ['pos', 0], negative: ['neg', 0], control_net: ['ucn', 0], image: ['ds', 0], strength, start_percent: 0, end_percent: end, vae: ['vae', 0] } },
    ms: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['unet', 0], shift: 3.1 } },
  }
  for (const seed of o.seeds) {
    g[`k${seed}`] = { class_type: 'KSampler', inputs: { model: ['ms', 0], positive: ['cn', 0], negative: ['cn', 1], latent_image: ['lat', 0], seed, steps: o.steps ?? QWEN_STEPS, cfg: 4, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } }
    g[`v${seed}`] = { class_type: 'VAEDecode', inputs: { samples: [`k${seed}`, 0], vae: ['vae', 0] } }
    g[`u${seed}`] = { class_type: 'ImageScale', inputs: { image: [`v${seed}`, 0], upscale_method: 'lanczos', width: HERO_W, height: HERO_H, crop: 'disabled' } }
    g[qwenSaveNode(seed)] = { class_type: 'SaveImage', inputs: { images: [`u${seed}`, 0], filename_prefix: `${o.prefix}-${seed}` } }
  }
  return g
}
