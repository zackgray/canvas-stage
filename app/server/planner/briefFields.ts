/**
 * The field checks both brief shapes share (the flat SceneBrief and the v2 SceneBriefV2, briefContract.ts): every error names its
 * field path so the retry message can quote it back. Pure; imports only the contracts (the Bible's validator imports the v2 check).
 */
import { BIBLE_TAG_RE, TAG_RE, type BriefElement, type BriefElementType, type BriefWarning } from '../../src/shared/bibleContract.ts'
import { slugTag, TAG_RULE } from './tagRepair.ts'

export const BRIEF_LIMITS = { brief: 1500, name: 60, look: 1000, line: 400, background: 300, beat: 240, elements: 8, warnings: 12, flesh: [20, 900] } as const
const TYPES: BriefElementType[] = ['person', 'creature', 'group', 'prop']

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** a required text field (min 1 by default) */
export const str = (o: Record<string, unknown>, k: string, where: string, max: number, errors: string[], min = 1): string => {
  const v = o[k]
  if (typeof v !== 'string') { errors.push(`${where}${k}: required text`); return '' }
  const t = v.trim()
  if (t.length < min) errors.push(`${where}${k}: must not be empty`)
  else if (t.length > max) errors.push(`${where}${k}: ${t.length} characters, at most ${max}`)
  return t
}

/** an optional text field: absent = '' (a small model leaving out an empty field is not worth a paid retry) */
export const opt = (o: Record<string, unknown>, k: string, where: string, max: number, errors: string[]): string =>
  o[k] === undefined || o[k] === null ? '' : str(o, k, where, max, errors, 0)

export function element(v: unknown, i: number, errors: string[]): BriefElement | null {
  const w = `elements[${i}].`
  if (!isObj(v)) { errors.push(`elements[${i}]: must be an object like {"name":"…","tag":"…","type":"person","look":"…","supported":true}`); return null }
  const name = str(v, 'name', w, BRIEF_LIMITS.name, errors)
  const look = str(v, 'look', w, BRIEF_LIMITS.look, errors)
  const tag = typeof v.tag === 'string' ? slugTag(v.tag) : ''
  if (!TAG_RE.test(tag)) errors.push(`${w}tag: ${JSON.stringify(v.tag)} breaks the tag rule: ${TAG_RULE}`)
  if (!TYPES.includes(v.type as BriefElementType)) errors.push(`${w}type: ${JSON.stringify(v.type)} must be one of ${TYPES.join(', ')}`)
  if (typeof v.supported !== 'boolean') errors.push(`${w}supported: must be true or false`)
  return { name, tag, type: v.type as BriefElementType, look, supported: v.supported === true }
}

export function warning(v: unknown, i: number, errors: string[]): BriefWarning | null {
  if (!isObj(v)) { errors.push(`warnings[${i}]: must be an object like {"element":"…","issue":"…","swap":"…"}`); return null }
  const w = `warnings[${i}].`
  return { element: str(v, 'element', w, BRIEF_LIMITS.name * 2, errors), issue: str(v, 'issue', w, BRIEF_LIMITS.line, errors), swap: str(v, 'swap', w, BRIEF_LIMITS.line, errors) }
}

export function warningList(raw: Record<string, unknown>, errors: string[]): BriefWarning[] {
  const out: BriefWarning[] = []
  if (raw.warnings !== undefined && (!Array.isArray(raw.warnings) || raw.warnings.length > BRIEF_LIMITS.warnings)) errors.push(`warnings: a list of at most ${BRIEF_LIMITS.warnings} ([] if none)`)
  else (raw.warnings as unknown[] | undefined ?? []).forEach((w, i) => { const x = warning(w, i, errors); if (x) out.push(x) })
  return out
}

/** story notes and lines that are not the logline: a tag becomes its plain word (E134: the model tagged them anyway) */
export const plain = (s: string) => s.trim().replace(BIBLE_TAG_RE, (_m, t: string) => t.replace(/[_-]+/g, ' '))

/** the answer's element tags as the gate will read them (slugged) */
export const answerTags = (raw: Record<string, unknown>): string[] =>
  Array.isArray(raw.elements) ? raw.elements.flatMap((e) => (isObj(e) && typeof e.tag === 'string' ? [slugTag(e.tag)] : [])) : []

/** the elements list: 1..8, each checked, no tag twice */
export function elementList<T extends BriefElement>(raw: Record<string, unknown>, errors: string[], one: (v: unknown, i: number) => T | null): T[] {
  const out: T[] = []
  if (!Array.isArray(raw.elements) || !raw.elements.length || raw.elements.length > BRIEF_LIMITS.elements) errors.push(`elements: required list of 1 to ${BRIEF_LIMITS.elements}`)
  else raw.elements.forEach((e, i) => { const x = one(e, i); if (x) out.push(x) })
  const seen = new Set<string>()
  out.forEach((e, i) => { if (e.tag && seen.has(e.tag)) errors.push(`elements[${i}].tag: @${e.tag} is used twice`); seen.add(e.tag) })
  return out
}
