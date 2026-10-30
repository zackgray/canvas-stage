/**
 * The gate for "Develop with AI" answers: shape and limits first (errors name the field, so the retry can quote them), then the
 * program's own support check (unsupported.ts) and the idea's must-keep details (mustKeep.ts) on a brief that passed: both only
 * add warnings, never change the brief's words. Only a brief that passes reaches the caller or disk.
 */
import { BRIEF_LEFT_OUT, promptTags, type BriefElement, type BriefWarning, type SceneBrief } from '../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../src/shared/briefContract.ts'
import { beatLine, flatLines } from '../bible/briefLines.ts'
import { answerTags, BRIEF_LIMITS, elementList, element, isObj, plain, str, warningList } from './briefFields.ts'
import { isV2, parseBriefV2 } from './briefV2.ts'
import { withKeepWarnings } from './mustKeep.ts'
import { paragraphDrops, paragraphError, statedPath } from './paragraphKeep.ts'
import { extractJson } from './planText.ts'
import { repairMentions, TAG_RULE } from './tagRepair.ts'
import { enforceSupport, fleshWarnings } from './unsupported.ts'

export { BRIEF_LIMITS } from './briefFields.ts'

/**
 * A developed brief: the flat lines every reader uses today, and (a v2 answer) the structured brief they are derived from. The
 * Scene step saves `v2` on the Bible as `brief` (wave 2, B2); until then the flat lines carry it.
 */
export type DevelopedBrief = SceneBrief & { v2?: SceneBriefV2 }

export type BriefCheck = { ok: true; brief: DevelopedBrief } | { ok: false; errors: string[] }

/**
 * How a v2 answer's paragraph (`logline`) is held to the idea's words (paragraphKeep.ts): 'gate' fails a trimmed paragraph (the
 * paid retry names what it dropped), 'warn' passes it with a left-out warning (the retry's answer, so a press never ends empty
 * over it), 'off' skips it (a brief that is not a fresh Develop answer).
 */
export type ParagraphRule = 'gate' | 'warn' | 'off'

/** Shape-check a parsed answer; on success the brief has the program's support and must-keep checks applied (`idea` = the director's words). */
export function parseBrief(answer: unknown, idea = '', paragraph: ParagraphRule = 'off'): BriefCheck {
  const errors: string[] = []
  if (!isObj(answer)) return { ok: false, errors: ['answer: must be a JSON object'] }
  if (isV2(answer)) return developedV2(answer, idea, paragraph)
  // run 1: "@honeycomb frame" for the element honeycomb_frame; repaired before the check, never after
  const raw = typeof answer.brief === 'string' ? { ...answer, brief: repairMentions(answer.brief, answerTags(answer)) } : answer
  const brief = str(raw, 'brief', '', BRIEF_LIMITS.brief, errors, 20)
  const lighting = str(raw, 'lighting', '', BRIEF_LIMITS.line, errors)
  const materials = str(raw, 'materials', '', BRIEF_LIMITS.line, errors)
  const background = typeof raw.background === 'string' ? raw.background.trim() : (errors.push('background: required text ("" when nobody is behind)'), '')
  if (background.length > BRIEF_LIMITS.background) errors.push(`background: ${background.length} characters, at most ${BRIEF_LIMITS.background}`)
  const elements: BriefElement[] = elementList(raw, errors, (e, i) => element(e, i, errors))
  const seen = new Set(elements.map((e) => e.tag))
  for (const t of promptTags(brief)) if (!seen.has(t)) errors.push(`brief: @${t} has no element; ${TAG_RULE}: write the element's tag exactly, add it to elements, or remove the @`)
  const beats: string[] = []
  if (!Array.isArray(raw.beats) || raw.beats.length < 3 || raw.beats.length > 4) errors.push('beats: required list of 3 or 4 short sentences')
  else raw.beats.forEach((b, i) => { if (typeof b !== 'string' || !b.trim()) errors.push(`beats[${i}]: required text`); else if (b.length > BRIEF_LIMITS.beat) errors.push(`beats[${i}]: at most ${BRIEF_LIMITS.beat} characters`); else beats.push(plain(b)) })
  const warnings = warningList(raw, errors)
  if (errors.length) return { ok: false, errors }
  return { ok: true, brief: withKeepWarnings(enforceSupport({ brief, elements, lighting, materials, background, beats, warnings }, idea), idea) }
}

/**
 * a v2 answer: shape-checked, its paragraph held to the idea, its `developed` list cleared of fields that only repeat the idea,
 * then the support and must-keep checks run on its flat lines and are copied back
 */
function developedV2(answer: Record<string, unknown>, idea: string, paragraph: ParagraphRule): BriefCheck {
  const errors: string[] = []
  const parsed = parseBriefV2(answer, errors)
  if (errors.length) return { ok: false, errors }
  const drops = idea.trim() && paragraph !== 'off' ? paragraphDrops(idea, parsed.logline) : []
  if (drops.length && paragraph === 'gate') return { ok: false, errors: [paragraphError(drops)] }
  const v2 = idea.trim() ? { ...parsed, developed: parsed.developed.filter((p) => !statedPath(idea, valueAt(parsed, p))) } : parsed
  const flat: SceneBrief = { brief: v2.logline, elements: v2.elements.map(({ name, tag, type, look, supported }) => ({ name, tag, type, look, supported })),
    ...flatLines(v2), beats: v2.beats.map(beatLine), warnings: v2.warnings }
  const checked = withKeepWarnings(enforceSupport(flat, idea), idea, v2)
  const supported = new Map(checked.elements.map((e) => [e.tag, e.supported]))
  // 'warn': what the paragraph dropped is one more left-out warning (Add back puts it in), minus what one already names
  const named = checked.warnings.filter((w) => w.issue.startsWith(BRIEF_LEFT_OUT)).map((w) => w.element.toLowerCase()).join(', ')
  const left = drops.filter((d) => !named.includes(d.toLowerCase()))
  const warnings = left.length ? [...checked.warnings, { element: left.join(', '), issue: BRIEF_LEFT_OUT, swap: left.join(', ') }] : checked.warnings
  const out: SceneBriefV2 = { ...v2, elements: v2.elements.map((e) => ({ ...e, supported: supported.get(e.tag) ?? e.supported })), warnings }
  return { ok: true, brief: { ...checked, warnings, v2: out } }
}

/** a field path's value ("light.direction", "atmosphere.0", "beats") */
const valueAt = (v: SceneBriefV2, path: string): unknown =>
  path.split('.').reduce<unknown>((at, k) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[k] : undefined), v)

/** a Develop answer's text through the gate; `paragraph` 'gate' for a first try, 'warn' for the last answer a press will get */
export function checkBriefText(text: string, idea: string, paragraph: ParagraphRule = 'gate'): BriefCheck {
  let raw: unknown
  try { raw = extractJson(text) } catch (e) { return { ok: false, errors: [`answer is not valid JSON: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`] } }
  return parseBrief(raw, idea, paragraph)
}

export type FleshCheck = { ok: true; description: string; warnings: BriefWarning[] } | { ok: false; errors: string[] }

export function checkFleshText(text: string, name: string): FleshCheck {
  let raw: unknown
  try { raw = extractJson(text) } catch (e) { return { ok: false, errors: [`answer is not valid JSON: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`] } }
  if (!isObj(raw)) return { ok: false, errors: ['answer: must be a JSON object like {"description":"…"}'] }
  const errors: string[] = []
  const d = str(raw, 'description', '', BRIEF_LIMITS.flesh[1], errors, BRIEF_LIMITS.flesh[0])
  return errors.length ? { ok: false, errors } : { ok: true, description: d, warnings: fleshWarnings(name, d) }
}
