/**
 * The planner's one Comfy graph (E132): Gemma 4 E4B (fp8) through core CLIPLoader (type stable_diffusion) -> TextGenerate ->
 * SaveText, N answers in one job so the model loads once. The system prompt goes through TextGenerate's `system_prompt`
 * input from one shared PrimitiveStringMultiline. Proven settings (E132, docs/stage3d-plan-prompt.md): max_length 1100,
 * temperature 0.5, top_k 40, top_p 0.95, min_p 0.05, no thinking. Pricing (E132 ledger): ~1.2 cr a plan in a batch of 11,
 * ~3 cr for a lone cold call, so a job is estimated at COLD + n * PER_ITEM. Pure.
 */
import type { ApiGraph } from '../comfy/index.ts'
import { PLANNER_CR, plannerCredits } from '../../src/shared/bibleContract.ts'

export const GEMMA = { clip_name: 'gemma4_e4b_it_fp8_scaled.safetensors', label: 'Gemma 4 E4B (fp8)' } as const
export interface Gen { maxLength: number; temperature: number; topK: number; topP: number; minP: number; repetition: number }
export const GEN: Gen = { maxLength: 1100, temperature: 0.5, topK: 40, topP: 0.95, minP: 0.05, repetition: 1.0 }
/**
 * Develop answers the v2 brief (prompt wave 2026-10-25): its worked examples are 2,000-2,350 characters against run 1's flat answer
 * of 1,650 (which fit 1100). The largest answer the gate allows (8 elements, 4 beats, 6 atmosphere) is ~5,400 characters, ~1,800
 * tokens at ~3 characters a token of JSON; 1900 leaves that room. The cap costs nothing until it is reached (GPU time is per token
 * written); a cut-off answer is invalid JSON and gets the one retry. Plans and flesh-outs keep 1100.
 */
export const GEN_DEVELOP: Gen = { ...GEN, maxLength: 1900 }
export const genFor = (kind: 'plan' | 'develop' | 'flesh'): Gen => (kind === 'develop' ? GEN_DEVELOP : GEN)

/** credits: a job loads the model cold (COLD) and pays per answer (PER_ITEM); one lone call = 3 */
export const COLD_CR = PLANNER_CR.cold
export const PER_ITEM_CR = PLANNER_CR.perItem
export const jobCredits = plannerCredits
export const MAX_ITEMS = 8

/** one answer to write: `key` names its nodes and its file (lower-case word), `user` is the user message */
export interface GenItem { key: string; user: string }
export const KEY_RE = /^[a-z][a-z0-9]{0,15}$/

export const genNode = (key: string) => `g_${key}`
export const saveNode = (key: string) => `s_${key}`

export function buildTextGraph(o: { items: GenItem[]; system: string; seed: number; prefix: string; gen?: Gen }): ApiGraph {
  const gen = o.gen ?? GEN
  if (!o.items.length || o.items.length > MAX_ITEMS) throw new Error(`a planner job is 1..${MAX_ITEMS} answers`)
  const g: ApiGraph = {
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: GEMMA.clip_name, type: 'stable_diffusion', device: 'default' } },
    sys: { class_type: 'PrimitiveStringMultiline', inputs: { value: o.system } },
  }
  o.items.forEach((it, i) => {
    if (!KEY_RE.test(it.key)) throw new Error(`bad answer key ${it.key}`)
    g[genNode(it.key)] = { class_type: 'TextGenerate', inputs: {
      clip: ['clip', 0], prompt: it.user, system_prompt: ['sys', 0], max_length: gen.maxLength, sampling_mode: 'on',
      'sampling_mode.temperature': gen.temperature, 'sampling_mode.top_k': gen.topK, 'sampling_mode.top_p': gen.topP,
      'sampling_mode.min_p': gen.minP, 'sampling_mode.repetition_penalty': gen.repetition, 'sampling_mode.seed': (o.seed + i) % 2 ** 31,
      thinking: false, use_default_template: true,
    } }
    g[saveNode(it.key)] = { class_type: 'SaveText', inputs: { text: [genNode(it.key), 0], filename_prefix: `${o.prefix}-${it.key}`, format: 'txt' } }
  })
  return g
}

/** the snapshot written to workflows/planner_gemma4-e4b.api.json (placeholder prompts, one answer) */
export const plannerSnapshot = (): ApiGraph =>
  buildTextGraph({ items: [{ key: 'p0', user: '<scene sentence>' }], system: '<system prompt>', seed: 13200, prefix: 'canvas-stage/planner' })
