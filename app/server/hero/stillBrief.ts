/**
 * The scene brief v2 (src/shared/briefContract.ts) read for the still, master and redraw prompts (prompt wave, 2026-10-25;
 * docs/plan-prompt-wave.md §4). Every word here comes from a brief field or from geometry; nothing is a house default (no age, no
 * low sun, no stock, no lens millimetres). The rules:
 *  - the action at a frame: the hero's beat at that time, else the take's written action, else the motion word (fallback only);
 *    but the pose at the frame first when the take's action names its own pose by clip phase (heroAction `pose`);
 *  - the place whole (setting, period, season, time, weather), never a first clause;
 *  - light as source → direction → height → quality → colour → effect, one key; faces in shade with a rim ONLY when the direction
 *    puts the key behind the subject;
 *  - atmosphere placed where the brief puts it; style only from `style`.
 * Pure.
 */
import { untag, type BibleRecord } from '../../src/shared/bibleContract.ts'
import type { BriefBeat, BriefElementV2, BriefLight, SceneBriefV2 } from '../../src/shared/briefContract.ts'
import { tagWords } from '../../src/shared/tagWords.ts'

const strip = (s: string | undefined) => (s ?? '').trim().replace(/[.\s]+$/, '')
const plain = (s: string | undefined) => strip(untag(s ?? '', (t) => t.replace(/[_-]+/g, ' ')))
const plainWords = plain
const cap = (s: string) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : '')
const sentence = (s: string) => (s ? `${cap(strip(s))}.` : '')

/** the Bible's v2 brief, when it has one with the fields the builders read (older Bibles have none) */
export function briefOf(bible: BibleRecord | null | undefined): SceneBriefV2 | null {
  const b = bible?.brief
  return b && typeof b === 'object' && b.place && b.light ? b : null
}

/** the brief element a tag names ('@ana' or 'ana') */
export const briefElement = (brief: SceneBriefV2 | null, tag: string | null | undefined): BriefElementV2 | null =>
  (tag && brief?.elements?.find((e) => e.tag === tag.replace(/^@/, ''))) || null

/** the hero's Bible tag: the cast element its card plays, else the brief's only person */
export function heroTagOf(bible: BibleRecord | null, castId: string | null | undefined, brief: SceneBriefV2 | null): string | null {
  const el = castId ? bible?.elements.find((e) => e.kind === 'cast' && e.cardId === castId) : null
  if (el) return el.tag
  const people = (brief?.elements ?? []).filter((e) => e.type === 'person')
  return people.length === 1 ? people[0].tag : null
}

/**
 * `who`'s beat at performance time `t` (seconds): the beats run in order, each `seconds` long; the beat of theirs running at `t`,
 * else their last one begun before it, else their first.
 */
export function beatAt(brief: SceneBriefV2 | null, who: string | null, t = 0): BriefBeat | null {
  if (!brief || !who) return null
  const mine = (b: BriefBeat) => b.who.replace(/^@/, '') === who && !!strip(b.does)
  let at = 0, last: BriefBeat | null = null
  for (const b of brief.beats ?? []) {
    const end = at + Math.max(0, Number(b.seconds) || 0)
    if (mine(b)) { if (at <= t) last = b; if (t < end) return at <= t ? b : last ?? b }
    at = end
  }
  return last ?? (brief.beats ?? []).find(mine) ?? null
}

/** a verb-led phrase's first verb as a participle ("lifts a frame" -> "lifting a frame"); '' when it does not lead with one */
export function participle(phrase: string): string {
  const m = /^([a-z]+)(\b.*)$/s.exec(phrase.trim())
  if (!m) return ''
  const [, w, rest] = m
  if (w.endsWith('ing')) return phrase.trim()
  if (w === 'has' || w === 'is') return `${w === 'has' ? 'having' : 'being'}${rest}`
  if (!/[^s]s$/.test(w) || w.length < 3) return ''
  let v = /(ss|sh|ch|x|z|o)es$/.test(w) ? w.slice(0, -2) : /ies$/.test(w) ? `${w.slice(0, -3)}y` : w.slice(0, -1)
  if (/ie$/.test(v)) v = `${v.slice(0, -2)}y`
  else if (/[^aeiouy]e$/.test(v) || /[aiu]e$/.test(v)) v = v.slice(0, -1)
  else if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(v)) v += v.slice(-1) // one syllable ending consonant-vowel-consonant: run -> running
  return `${v}ing${rest}`
}

/** a full sentence about the subject ("She lifts…", "Ana kneels…"): said as its own sentence, not attached to the subject */
const PRONOUN_LED = /^(she|he|they|it|we|i|you|the person|the performer)\b/i

/** a name as a sentence's subject: "the beekeeper" -> "The beekeeper", "Mara" stays */
const subjectOf = (name: string | undefined) => cap(plain(name))

/**
 * The hero's action at this frame, ready to place: `attach` follows the subject ("Photo of <who>, walking towards us"), `after` is
 * its own sentence ("The beekeeper lifts a frame from the hive, squinting into the sun."). Beat first (with its `visible` cue), then
 * the take's written action, then the motion word. A verb-led line gets the person's name as its subject; with no name it is
 * attached as a participle ("lifting a frame").
 * `pose`: the motion words are the pose at this frame from an action that names its own phases (stillAction.ts motionAt); they then
 * come first and alone, so a still never draws a beat's end state (the frame in her hands) on a frame where it has not happened.
 */
export function heroAction(o: { beat: BriefBeat | null; takeAction?: string; motion?: string; pose?: boolean; name?: string
  /** the brief's elements: a tag in the action is then said with its article, as the render's briefWords says it (review F7) */
  elements?: readonly { tag: string; name?: string; type?: string }[] }): { attach: string; after: string } {
  const who = subjectOf(o.name)
  const plain = (s: string | undefined) => (o.elements ? strip(tagWords(s ?? '', o.elements)) : plainWords(s))
  if (o.pose && plain(o.motion)) return { attach: plain(o.motion), after: '' }

  const place = (line: string, visible = '') => {
    const lower = line.replace(/^[A-Z](?=[a-z]+s\b)/, (c) => c.toLowerCase())
    const ing = participle(lower)
    if (ing === lower) return { attach: [lower, visible].filter(Boolean).join(', '), after: '' } // already a participle
    if (!ing) return { attach: '', after: sentence([line, visible].filter(Boolean).join(', ')) } // it carries its own subject
    return who ? { attach: '', after: sentence([`${who} ${lower}`, visible].filter(Boolean).join(', ')) } : { attach: [ing, visible].filter(Boolean).join(', '), after: '' }
  }
  if (o.beat) return place(plain(o.beat.does), plain(o.beat.visible))
  const written = plain(o.takeAction)
  if (written) return PRONOUN_LED.test(written) ? { attach: '', after: sentence(written) } : place(written)
  return { attach: plain(o.motion), after: '' }
}

/** the place whole: "an old apple orchard, autumn, late afternoon, clear" (each field once, in the brief's own words) */
export function placeOf(brief: SceneBriefV2): string {
  const p = brief.place
  const parts = [p.setting, p.period, p.season, p.time, p.weather].map(plain).filter(Boolean)
  const out: string[] = []
  for (const x of parts) if (!out.some((o) => o.toLowerCase().includes(x.toLowerCase()))) out.push(x)
  return out.join(', ')
}

/** the key is behind the subject (a backlight): only then are faces in shade with a rim */
export const keyBehind = (l: BriefLight) => /\bbehind\b|\bback ?lit\b|\bbacklight|\btowards? (the )?(camera|lens|us)\b|\binto (the )?(camera|lens)\b|\bfar side\b/i.test(l.direction ?? '')

/** words that put a person in a sentence (a master names nobody) */
const PERSON = /\b(her|him|his|hers|them|their|she|he|they|hands?|face|shoulders?|hair)\b/i

/** a direction said with nobody in the picture: "behind her" is the far side; any other clause naming a person goes */
const placeDirection = (d: string) => plain(d).split(/\s*,\s*/).map((x) => x.replace(/^behind (her|him|them|the \w+)$/i, 'from the far side'))
  .filter((x) => x && !PERSON.test(x)).join(', ')

/** the brief's light as one sentence (+ its effect): source, direction, height, quality, colour, then what it does */
export function lightOf(l: BriefLight, people: boolean): string {
  const key = plain(l.key)
  if (!key) return ''
  const has = (w: string) => new RegExp(`\\b${w}\\b`, 'i').test(key)
  const adj = [l.quality && !has(l.quality) ? l.quality : '', l.height && !has(l.height) ? l.height : ''].filter(Boolean).join(' ')
  const colour = plain(l.colour)
  const art = /^(a|an|the)\s+/i.exec(key)
  const lead = !adj ? key : !art ? `${adj} ${key}` // "a low sun" + hard -> "a hard low sun"
    : `${/^the$/i.test(art[1]) ? art[1] : /^[aeiou]/i.test(adj) ? 'an' : 'a'} ${adj} ${key.slice(art[0].length)}`
  const head = [lead, people ? plain(l.direction) : placeDirection(l.direction), colour && !key.toLowerCase().includes(colour.toLowerCase()) ? `${colour} light` : ''].filter(Boolean).join(', ')
  const behind = keyBehind(l)
  const rim = behind ? (people ? 'faces in shade with a rim of light on hair and shoulders' : 'every edge rimmed with light') : ''
  const long = behind && l.height === 'low' ? 'long shadows falling towards us' : ''
  const first = [head, rim, long].filter(Boolean).join(': ').replace(/: ([^:]*): /, ': $1, ')
  const effect = people ? plain(l.effect) : ''
  const others = plain(l.others)
  return [sentence(first), sentence(others), sentence(effect)].filter(Boolean).join(' ')
}

/** the atmosphere, placed: "Bees around her hands and the hive." (a master keeps the thing, drops a place that names a person) */
export function atmosphereOf(brief: SceneBriefV2, people: boolean): string {
  const xs = (brief.atmosphere ?? []).map((a) => {
    const what = plain(a.what), where = plain(a.where)
    if (!what) return ''
    return where && (people || !PERSON.test(where)) ? `${what} ${where}` : what
  }).filter(Boolean)
  return xs.length ? sentence(xs.join('; ')) : ''
}

/** a brief element's material and condition words, as the brief implies them ('' when it gives none) */
export const surfaceOf = (el: BriefElementV2 | null): string => [plain(el?.materials), plain(el?.condition)].filter(Boolean).join(', ')

/** the brief's style sentence, '' when it names none (the only place a stock or a look word may come from) */
export const styleOf = (brief: SceneBriefV2 | null): string => sentence(plain(brief?.style))
