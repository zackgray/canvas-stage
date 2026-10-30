/**
 * Concept candidates for Scene's look pieces: Qwen-Image 2512 text-to-image, unlocked (no depth, no set), one KSampler per image in
 * one job so the model loads once. A copy of experiments/lib/e16-models.ts `qwen2512` (the image_qwen_Image_2512 template: fp8 UNet,
 * ModelSamplingAuraFlow shift 3.1, 50 steps, CFG 4, euler/simple, the template's negative, its 16:9 bucket 1664x928) and its
 * `qwen2512l` draft arm (the template's Lightning 4-step LoRA: 4 steps, CFG 1), which E125's mood boards used at ~1 cr a picture.
 * Props draw on the template's 3:4 bucket (a flat-lit reference standing upright, as E135's sword), or its 4:3 when the words ask for a side-on view.
 * The negative loses its photo-look items when the words state a picture medium (prompt/style.ts statedStyle). Pure.
 */
import type { ApiGraph } from '../comfy/index.ts'
import type { ConceptKind, ConceptQuality } from '../../src/shared/sceneContract.ts'
import { qwenNegative } from '../hero/qwenGraph.ts'
import { statedStyle } from '../prompt/style.ts'
import { SIDE } from './conceptText.ts'
// the words of every concept kind live in conceptText.ts (pure, so the Stage previews the exact text before a paid draw)
export { conceptPrompt, type ConceptWords } from './conceptText.ts'

export const QWEN_UNET = 'qwen_image_2512_fp8_e4m3fn.safetensors'
export const QWEN_LIGHTNING_4 = 'Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors'
export const CONCEPT_SAMPLING: Record<ConceptQuality, { steps: number; cfg: number }> = { full: { steps: 50, cfg: 4 }, draft: { steps: 4, cfg: 1 } }
/** a prop whose words ask for a side-on view (conceptText.ts SIDE, the same test the words use) or a three-quarter one is a long
 *  shape: it draws on a landscape frame, not the upright one */
const LONG = (p: string) => SIDE.test(p) || /\b(three[- ]quarter|3\/4)[- ]?(view|angle|shot)\b/i.test(p)
export const conceptSize = (kind: ConceptKind, prompt = '') =>
  kind === 'prop' ? (LONG(prompt) ? { width: 1472, height: 1104 } : { width: 1104, height: 1472 }) : { width: 1664, height: 928 }
export const conceptSaveNode = (k: number) => `s${k}`

export interface ConceptGraphOpts { prompt: string; seeds: number[]; quality: ConceptQuality; kind: ConceptKind; prefix: string }

export function buildConceptGraph(o: ConceptGraphOpts): ApiGraph {
  const { steps, cfg } = CONCEPT_SAMPLING[o.quality]
  const g: ApiGraph = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: QWEN_UNET, weight_dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
    pos: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: o.prompt } },
    neg: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: qwenNegative({ styled: statedStyle(o.prompt) }) } },
    lat: { class_type: 'EmptySD3LatentImage', inputs: { ...conceptSize(o.kind, o.prompt), batch_size: 1 } },
  }
  let model: [string, number] = ['unet', 0]
  if (o.quality === 'draft') {
    g.lora = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: QWEN_LIGHTNING_4, strength_model: 1 } }
    model = ['lora', 0]
  }
  g.ms = { class_type: 'ModelSamplingAuraFlow', inputs: { model, shift: 3.1 } }
  o.seeds.forEach((seed, k) => {
    g[`k${k}`] = { class_type: 'KSampler', inputs: { model: ['ms', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['lat', 0], seed, steps, cfg, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } }
    g[`v${k}`] = { class_type: 'VAEDecode', inputs: { samples: [`k${k}`, 0], vae: ['vae', 0] } }
    g[conceptSaveNode(k)] = { class_type: 'SaveImage', inputs: { images: [`v${k}`, 0], filename_prefix: `${o.prefix}-${seed}` } }
  })
  return g
}
