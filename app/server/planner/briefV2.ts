/**
 * The v2 brief's shape check (briefContract.ts SceneBriefV2): Develop's answer and a brief the user saves on the Bible pass the same
 * gate. Errors name the field path so the retry can quote them. Lenient only where a small model's slip costs a paid retry and loses
 * nothing: an absent text field is '', "n/a" for an enum is '', seconds may be "2" or "2 s". Tags: element tags are made one token,
 * the logline's split mentions are repaired (tagRepair.ts), a beat's `who` must be an element tag, and @tags anywhere else become
 * plain words (only the logline carries tags). Pure.
 */
import { promptTags } from '../../src/shared/bibleContract.ts'
import type { BriefAtmosphere, BriefBeat, BriefCamera, BriefElementV2, BriefLight, BriefPlace, SceneBriefV2 } from '../../src/shared/briefContract.ts'
import { answerTags, element, elementList, isObj, opt, plain, str, warningList } from './briefFields.ts'
import { repairMentions, slugTag, TAG_RULE } from './tagRepair.ts'
import { tagWords } from '../../src/shared/tagWords.ts'

/**
 * Text limits. Guided writes the user's own step texts into these fields, so every prose field takes PROSE (1000) - the user's words
 * are never refused at ordinary sizes. Kept short on purpose: colour (a word or two, joined into the light line), the enums, the
 * lists' counts, exclude items (each is a "no X" phrase sent as a negative). Real downstream clips are NOT limits here: the derived
 * Bible lines are clipped on the way down (lighting 400, background 300 = bible/validate.ts LIMITS), the logline is held to 1500
 * (the planner's sentence is clipped separately). TOTAL caps the whole brief so a pathological paste is still refused.
 */
const PROSE = 1000
export const V2_LIMITS = {
  logline: [20, 1500], place: PROSE, key: PROSE, direction: PROSE, colour: 200, others: PROSE, effect: PROSE, atmosphere: 6, what: PROSE, where: PROSE,
  materials: PROSE, condition: PROSE, face: PROSE, beats: [1, 8], does: PROSE, visible: PROSE, seconds: [0.5, 20], camera: 400, style: PROSE,
  background: PROSE, exclude: 8, excludeItem: 120, paths: 80, path: 60, total: 12000,
} as const

const HEIGHTS = ['low', 'high', 'overhead'] as const
const QUALITIES = ['hard', 'soft'] as const
const LENS = ['wide', 'normal', 'long'] as const

/** true when an answer is in the v2 shape (the flat SceneBrief has a "brief" line and no "logline" / light object) */
export const isV2 = (raw: unknown): boolean => isObj(raw) && (typeof raw.logline === 'string' || isObj(raw.light))

const sub = (raw: Record<string, unknown>, k: string, errors: string[]): Record<string, unknown> => {
  if (raw[k] === undefined) return {}
  if (!isObj(raw[k])) { errors.push(`${k}: must be an object`); return {} }
  return raw[k] as Record<string, unknown>
}
const free = (o: Record<string, unknown>, k: string, where: string, max: number, errors: string[]) => plain(opt(o, k, where, max, errors))

function choice<T extends string>(o: Record<string, unknown>, k: string, where: string, allowed: readonly T[], errors: string[]): T | '' {
  const v = o[k]
  if (v === undefined || v === null) return ''
  const t = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (t === '' || /^(n\/?a|none|-|unknown)$/.test(t)) return ''
  if ((allowed as readonly string[]).includes(t)) return t as T
  errors.push(`${where}${k}: ${JSON.stringify(v)} must be one of ${allowed.map((a) => `"${a}"`).join(', ')} or ""`)
  return ''
}

function list<T>(raw: Record<string, unknown>, k: string, max: number, errors: string[], one: (v: unknown, i: number) => T | null, min = 0): T[] {
  const v = raw[k] ?? (min ? undefined : [])
  if (!Array.isArray(v) || v.length < min || v.length > max) { errors.push(`${k}: ${min ? `required list of ${min} to ${max}` : `a list of at most ${max} ([] if none)`}`); return [] }
  return v.flatMap((x, i) => { const y = one(x, i); return y === null ? [] : [y] })
}
const strings = (raw: Record<string, unknown>, k: string, max: number, each: number, errors: string[]) => list(raw, k, max, errors, (v, i) => {
  if (typeof v !== 'string' || v.length > each) { errors.push(`${k}[${i}]: text of at most ${each} characters`); return null }
  return v.trim() || null
})

function place(raw: Record<string, unknown>, errors: string[]): BriefPlace {
  const o = sub(raw, 'place', errors), L = V2_LIMITS.place
  return { setting: free(o, 'setting', 'place.', L, errors), period: free(o, 'period', 'place.', L, errors), season: free(o, 'season', 'place.', L, errors),
    time: free(o, 'time', 'place.', L, errors), weather: free(o, 'weather', 'place.', L, errors) }
}

function light(raw: Record<string, unknown>, errors: string[]): BriefLight {
  const o = sub(raw, 'light', errors), w = 'light.', L = V2_LIMITS
  return { key: free(o, 'key', w, L.key, errors), direction: free(o, 'direction', w, L.direction, errors), height: choice(o, 'height', w, HEIGHTS, errors),
    quality: choice(o, 'quality', w, QUALITIES, errors), colour: free(o, 'colour', w, L.colour, errors), others: free(o, 'others', w, L.others, errors),
    effect: free(o, 'effect', w, L.effect, errors) }
}

function camera(raw: Record<string, unknown>, errors: string[]): BriefCamera {
  const o = sub(raw, 'camera', errors), w = 'camera.', L = V2_LIMITS.camera
  return { size: free(o, 'size', w, L, errors), angle: free(o, 'angle', w, L, errors), move: free(o, 'move', w, L, errors), lensFeel: choice(o, 'lensFeel', w, LENS, errors) }
}

function elementV2(v: unknown, i: number, errors: string[]): BriefElementV2 | null {
  const base = element(v, i, errors)
  if (!base || !isObj(v)) return null
  const w = `elements[${i}].`, L = V2_LIMITS
  return { ...base, materials: free(v, 'materials', w, L.materials, errors), condition: free(v, 'condition', w, L.condition, errors), face: free(v, 'face', w, L.face, errors) }
}

function seconds(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : NaN
  return Number.isFinite(n) && n >= V2_LIMITS.seconds[0] && n <= V2_LIMITS.seconds[1] ? n : null
}

function beat(v: unknown, i: number, tags: Set<string>, errors: string[]): BriefBeat | null {
  const w = `beats[${i}].`
  if (!isObj(v)) { errors.push(`beats[${i}]: must be an object like {"who":"@tag","does":"…","seconds":2,"visible":"…"}`); return null }
  const who = typeof v.who === 'string' ? slugTag(v.who) : ''
  if (!tags.has(who)) errors.push(`${w}who: ${JSON.stringify(v.who)} must be one element's @tag (${TAG_RULE})`)
  const does = plain(str(v, 'does', w, V2_LIMITS.does, errors))
  const s = seconds(v.seconds)
  if (s === null) errors.push(`${w}seconds: ${JSON.stringify(v.seconds)} must be a number of seconds, ${V2_LIMITS.seconds[0]} to ${V2_LIMITS.seconds[1]}`)
  return { who: `@${who}`, does, seconds: s ?? 0, visible: free(v, 'visible', w, V2_LIMITS.visible, errors) }
}

function atmos(v: unknown, i: number, errors: string[]): BriefAtmosphere | null {
  if (!isObj(v)) { errors.push(`atmosphere[${i}]: must be an object like {"what":"…","where":"…"}`); return null }
  const w = `atmosphere[${i}].`
  return { what: plain(str(v, 'what', w, V2_LIMITS.what, errors)), where: free(v, 'where', w, V2_LIMITS.where, errors) }
}

/** the answer with every @tag outside the logline, the elements and a beat's `who` said as its element's name (F3) */
function withNames(raw: Record<string, unknown>, elements: readonly BriefElementV2[]): Record<string, unknown> {
  const say = (v: unknown, keepWho = false): unknown => {
    if (typeof v === 'string') return tagWords(v, elements)
    if (Array.isArray(v)) return v.map((x) => say(x, keepWho))
    if (!isObj(v)) return v
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, keepWho && k === 'who' ? x : say(x)]))
  }
  const out = { ...raw }
  for (const k of ['place', 'light', 'atmosphere', 'camera', 'style', 'background', 'exclude'] as const) if (raw[k] !== undefined) out[k] = say(raw[k])
  if (raw.beats !== undefined) out.beats = say(raw.beats, true)
  return out
}

/** Shape-check a v2 brief. The result is only meaningful when `errors` gained nothing. */
export function parseBriefV2(answer: Record<string, unknown>, errors: string[]): SceneBriefV2 {
  const tagList = answerTags(answer)
  const raw = typeof answer.logline === 'string' ? { ...answer, logline: repairMentions(answer.logline, tagList) } : answer
  const logline = str(raw, 'logline', '', V2_LIMITS.logline[1], errors, V2_LIMITS.logline[0])
  const elements = elementList(raw, errors, (e, i) => elementV2(e, i, errors))
  const tags = new Set(elements.map((e) => e.tag))
  // F3: an @tag in any story field is said as its element's name with its article (tagWords), before the fields are checked
  const named = withNames(raw, elements)
  for (const t of promptTags(logline)) if (!tags.has(t)) errors.push(`logline: @${t} has no element; ${TAG_RULE}: write the element's tag exactly, add it to elements, or remove the @`)
  const L = V2_LIMITS
  const out: SceneBriefV2 = {
    logline, place: place(named, errors), light: light(named, errors), atmosphere: list(named, 'atmosphere', L.atmosphere, errors, (v, i) => atmos(v, i, errors)),
    elements, beats: list(named, 'beats', L.beats[1], errors, (v, i) => beat(v, i, tags, errors), L.beats[0]), camera: camera(named, errors),
    style: free(named, 'style', '', L.style, errors), background: free(named, 'background', '', L.background, errors),
    exclude: strings(named, 'exclude', L.exclude, L.excludeItem, errors), warnings: warningList(raw, errors),
    developed: strings(raw, 'developed', L.paths, L.path, errors),
  }
  if (raw.user !== undefined) out.user = strings(raw, 'user', L.paths, L.path, errors)
  const whole = JSON.stringify(out).length
  if (whole > L.total) errors.push(`brief: ${whole} characters in all, at most ${L.total}; shorten the longest fields`)
  return out
}
