/**
 * The scene planner's words and gate (ported from E132, app/experiments/lib/e132-plan-llm.ts): the system prompt is
 * docs/stage3d-plan-prompt.md between its two `=== PROMPT ===` markers plus the compact-output note (the doc itself fits the set to
 * the sentence since the 2026-10-24 QA: only pieces it names or implies, no war-camp filler); an answer is parsed
 * (JSON pulled out of fences / chatter), its constant fields filled, then checked by the app's own parsePlan. A failed answer
 * gets ONE retry that quotes the validator's errors back; if that fails too, repairPlan clamps it and parsePlan has the last word.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScenePlan } from '../../src/stage3d/contract.ts'
import { parsePlan, repairPlan } from '../../src/stage3d/plan.ts'
import { sentenceOf } from '../../src/stage3d/planProps.ts'
import { DEFAULT_SKY } from '../../src/stage3d/planRules.ts'

const DOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'stage3d-plan-prompt.md')

/** output-token saver (GPU seconds are the cost): the program fills the constant fields, the model writes only what varies */
export const COMPACT_NOTE = `## Output format (overrides the examples' layout)
Write COMPACT JSON. Leave out "sentence", "flat", "tufts" and the "sky" url/yawDeg/horizonLiftDeg/band (the program adds them). Keep only: "seed", "groundShade", "puddles", "fog", "light", and "sky" as {"gain":..,"cutDeg":..}, then "kit". Put the whole header on one line and EACH kit item on ONE line, like:
{"seed":17,"groundShade":0.45,"puddles":0,"fog":{"color":"#7d7f84","density":0.018},"light":{"fill":1.3,"key":1.0,"keyDir":[140,10]},"sky":{"gain":1.05,"cutDeg":10},"kit":[
{"kind":"treeline","args":[160,3,10],"at":[0,-65]},
{"kind":"hut","args":[5,6,5],"at":[-9,-22],"yawDeg":20}
]}`

export function planSystemPrompt(doc = readFileSync(DOC, 'utf8')): string {
  const parts = doc.split(/^=== PROMPT ===\s*$/m)
  if (parts.length < 3) throw new Error('plan prompt markers not found in docs/stage3d-plan-prompt.md')
  return `${parts[1].trim()}\n\n${COMPACT_NOTE}`
}

/** Pull the JSON object out of a model answer (thinking, fences, chatter around it). */
export function extractJson(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/gi, '')
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('no JSON object in the answer')
  return JSON.parse(t.slice(a, b + 1))
}

const SKY = { url: DEFAULT_SKY, yawDeg: 90, horizonLiftDeg: 1.2, gain: 1.05, band: [0.31, 0.9], cutDeg: 10 }
/** merge the constant fields back in (a model that wrote them anyway keeps its own values) */
export function fillConstants(raw: Record<string, unknown>, sentence: string): Record<string, unknown> {
  const sky = { ...SKY, ...(raw.sky && typeof raw.sky === 'object' ? (raw.sky as object) : {}) }
  // the plan keeps the place's words: the Props list is the planner's brief, not the scene's sentence (prompts that fall back on it)
  return { sentence: sentenceOf(sentence), flat: [-3, -16, 3, 8], tufts: 0, ...raw, sky }
}

export type PlanCheck = { ok: true; plan: ScenePlan } | { ok: false; errors: string[]; raw?: unknown }

/** parsePlan on the answer, constants filled. */
export function checkPlanText(text: string, sentence: string): PlanCheck {
  let raw: unknown
  try { raw = extractJson(text) } catch (e) { return { ok: false, errors: [`answer is not valid JSON: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`] } }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) raw = fillConstants(raw as Record<string, unknown>, sentence)
  const r = parsePlan(raw, { corridor: true })
  return r.ok ? { ok: true, plan: r.plan } : { ok: false, errors: r.errors, raw }
}

/** The last resort after the retry: repairPlan, then parsePlan again (null when even that fails). */
export function repairChecked(raw: unknown): { plan: ScenePlan; notes: string[] } | null {
  if (raw === undefined) return null
  const rep = repairPlan(raw)
  const r = parsePlan(rep.plan, { corridor: true })
  return r.ok ? { plan: r.plan, notes: rep.notes } : null
}

/** the second message for a failed answer (wording from the prompt doc's retry section) */
export function retryMessage(user: string, prevText: string, errors: string[], what = 'plan'): string {
  const prev = (() => { try { return JSON.stringify(extractJson(prevText)) } catch { return prevText.slice(0, 4000) } })()
  return `${user}\n\nYour previous answer:\n${prev}\n\nYour ${what} was rejected: ${errors.slice(0, 12).join('; ')}. Fix only these and answer with the full corrected JSON.`
}
