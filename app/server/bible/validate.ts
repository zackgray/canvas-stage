/** Input checks for the Bible store: everything a request can put on disk is shaped here first. */
import { ELEMENT_KINDS, promptTags, TAG_RE, type BibleElement, type BibleExtrasSheet, type BibleMaster, type BibleSaveRequest, type SceneBriefV2 } from '../../src/shared/bibleContract.ts'
import { isObj } from '../planner/briefFields.ts'
import { parseBriefV2 } from '../planner/briefV2.ts'

export { TAG_RE } from '../../src/shared/bibleContract.ts'
const CARD_RE = /^[a-z0-9][a-z0-9-]{0,40}$/
const MASTER_ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/
export const LIMITS = { prompt: 4000, line: 600, lighting: 400, materials: 400, background: 300, refs: 12 } as const

export class BibleError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
const bad = (m: string) => new BibleError(400, m)

export const isMasterId = (s: unknown): s is string => typeof s === 'string' && MASTER_ID_RE.test(s)

export function text(v: unknown, name: string, max: number): string {
  if (typeof v !== 'string') throw bad(`${name} must be text`)
  if (v.length > max) throw bad(`${name} is longer than ${max} characters`)
  return v.trim()
}

/** A reference is a public URL path under the app (a copy under bible/elements/ or a /lab-assets URL). */
const refOk = (r: unknown): r is string => typeof r === 'string' && /^\/[A-Za-z0-9_\-./%]+$/.test(r) && !r.split('/').includes('..')

export function validElement(e: unknown): BibleElement {
  const el = e as Partial<BibleElement> | null
  if (!el || typeof el !== 'object') throw bad('element missing')
  if (typeof el.tag !== 'string' || !TAG_RE.test(el.tag)) throw bad('tag must be a lower-case word (letters, digits, _ and -), 32 at most, without the @')
  if (!ELEMENT_KINDS.includes(el.kind as never)) throw bad(`kind must be one of ${ELEMENT_KINDS.join(', ')}`)
  const needsCard = el.kind === 'cast' || el.kind === 'creature'
  if (needsCard && (typeof el.cardId !== 'string' || !CARD_RE.test(el.cardId))) throw bad(`${el.kind} elements need the Cast card id`)
  if (el.cardId !== undefined && !(typeof el.cardId === 'string' && CARD_RE.test(el.cardId))) throw bad('bad card id')
  const refs = el.refs ?? []
  if (!Array.isArray(refs) || refs.length > LIMITS.refs || !refs.every(refOk)) throw bad(`refs must be up to ${LIMITS.refs} public paths`)
  const line = text(el.line ?? '', 'line', LIMITS.line)
  return { tag: el.tag, kind: el.kind as BibleElement['kind'], ...(el.cardId ? { cardId: el.cardId } : {}), refs: [...refs], line }
}

/** what a save may carry beyond the contract's request: the v2 brief (null clears it) */
export type SaveFields = Omit<BibleSaveRequest, 'worldId' | 'brief'> & { brief?: unknown }

/**
 * A v2 scene brief as Develop's gate checks it (planner/briefV2.ts: shape, limits, tags) - the user's own edits and a pasted brief
 * pass the same rules. The support and must-keep warnings are Develop's, not the store's.
 */
export function validBrief(v: unknown): SceneBriefV2 {
  if (!isObj(v)) throw bad('brief must be an object in the v2 shape (logline, place, light, atmosphere, elements, beats, camera, style, background, exclude, warnings, developed)')
  const errors: string[] = []
  const b = parseBriefV2(v, errors)
  if (errors.length) throw bad(`brief: ${errors.slice(0, 8).join('; ')}`)
  return b
}

export function validMaster(m: BibleMaster): BibleMaster {
  if (!isMasterId(m?.id) || !refOk(m.png)) throw bad('bad master')
  return m
}

export function validSheet(s: BibleExtrasSheet | null): BibleExtrasSheet | null {
  if (s === null) return null
  if (!refOk(s?.png) || !Number.isInteger(s.variants) || s.variants < 1 || s.variants > 12) throw bad('bad extras sheet')
  return { png: s.png, variants: s.variants }
}

/**
 * Free and writes nothing (wave 3 M1): every reason a design would be refused once a world exists - a line over its limit, an
 * element the element route refuses (a cast tile with no Cast card), a tag used twice, a prompt tag with no element - so Build the
 * set can refuse before the paid plan. Empty = it would all be written.
 */
export function checkDesign(r: SaveFields & { elements?: unknown }): string[] {
  const errors: string[] = []
  const run = (f: () => unknown) => { try { f() } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) } }
  run(() => r.prompt === undefined || text(r.prompt, 'prompt', LIMITS.prompt))
  run(() => r.lighting === undefined || text(r.lighting, 'lighting', LIMITS.lighting))
  run(() => r.materials === undefined || text(r.materials, 'materials', LIMITS.materials))
  run(() => r.background === undefined || text(r.background, 'background', LIMITS.background))
  run(() => r.extrasSheet === undefined || validSheet(r.extrasSheet))
  run(() => r.brief === undefined || r.brief === null || validBrief(r.brief))
  const tags: string[] = []
  for (const e of Array.isArray(r.elements) ? r.elements : []) {
    run(() => {
      try { tags.push(validElement(e).tag) } catch (x) { throw bad(`@${String((e as { tag?: unknown } | null)?.tag)}: ${(x as Error).message}`) }
    })
  }
  for (const t of new Set(tags.filter((t, i) => tags.indexOf(t) !== i))) errors.push(`@${t} is used by two tiles`)
  if (typeof r.prompt === 'string') for (const t of promptTags(r.prompt)) if (!tags.includes(t)) errors.push(`the brief names @${t}, which has no tile on the board`)
  return errors
}
