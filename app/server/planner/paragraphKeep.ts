/**
 * The developed paragraph keeps the idea (owner, 2026-10-25): every content word the director wrote (who, gender, age, looks,
 * wardrobe, action, light direction, the air, the camera) must still be in the v2 brief's `logline`, the paragraph the Scene step
 * shows and the Bible keeps as the scene prompt. Function words are skipped, word forms match ("lifts" ~ "lifting", "bees" ~ "bee"),
 * an @tag reads as its words (@honeycomb_frame = "honeycomb frame"), a hyphenated word must stay one phrase ("grey-white"), and a
 * she/he in the idea needs a gendered word in the paragraph. What is missing comes back as the idea's own phrases, in order, so the
 * retry message can name them. Also: which `developed` paths only repeat the idea (statedPath). General, never per concept. Pure.
 */

/** words that carry no detail of the scene: articles, pronouns, linking words and plain prepositions (direction words are NOT here) */
const STOP = new Set(`a an the and or but nor of in on at to from with without for by as into onto than then so such very just also too
is are was were be been being has have had do does did will would can could may might must shall should this that these those there here
it its it's they them their theirs we us our you your i me my he him his she her hers herself himself themselves itself one ones
who whom whose which what where when while whilst if because though although until about across around among amid along between beside besides
near next past via per each every some any all both either neither no not only own same other another more most much many few
like just again still even ever really quite rather almost already yet shot scene`.split(/\s+/))

/** a joining word starts a new phrase in what the retry names ("wooden hive" | "holds it up", not one run) */
const CLAUSE = new Set(['and', 'or', 'but', 'then', 'while', 'whilst', 'as', 'so'])

const FEMALE = /\b(?:she|her|hers|herself|woman|women|girls?|lady|ladies|female|mother|grandmother|wife|daughter|sister|aunt|queen|nun|actress)\b/i
const MALE = /\b(?:he|him|his|himself|man|men|boys?|gentlem[ae]n|male|father|grandfather|husband|son|brother|uncle|king|monk|actor)\b/i

/** one word form for matching: lower case, no possessive, a plural or an -ing, -ed or -ly ending off, a final e and a doubled end off */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[’']s$/, '')
  if (/ies$/.test(w) && w.length > 4) w = `${w.slice(0, -3)}y`
  else if (/(?:s|x|z|ch|sh)es$/.test(w) && w.length > 4) w = w.slice(0, -2)
  else if (/[^s]s$/.test(w) && w.length > 3) w = w.slice(0, -1)
  else for (const s of ['ing', 'ed', 'ly']) if (w.endsWith(s) && w.length - s.length >= 3) { w = w.slice(0, -s.length); break }
  return w.replace(/e$/, '').replace(/(.)\1$/, '$1')
}

interface Tok { word: string; at: number; parts: string[]; stop: boolean }
/** the words in order (a hyphenated word is one token of parts); `brk` marks punctuation between words */
function tokens(text: string): (Tok | 'brk')[] {
  const out: (Tok | 'brk')[] = []
  for (const m of text.matchAll(/([A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)*)|([.,;:!?()—–"]+)/g)) {
    if (m[2]) { out.push('brk'); continue }
    const word = m[1]
    const parts = word.split('-').map(stem)
    out.push({ word, at: m.index ?? 0, parts, stop: !word.includes('-') && STOP.has(word.toLowerCase().replace(/[’']s$/, '')) })
  }
  return out
}

/** the paragraph as stems in order: @tags and underscores read as words */
const paraStems = (para: string) => tokens(para.replace(/@/g, ' ').replace(/_/g, ' ')).flatMap((t) => (t === 'brk' ? [] : t.word.split('-').map(stem)))

const hasRun = (hay: string[], parts: string[]) => hay.some((_, i) => parts.every((p, k) => hay[i + k] === p))

/**
 * The idea's phrases missing from the paragraph, as the idea wrote them ("seventies", "grey-white hair", "looking up"). Missing
 * words next to each other (only function words between, no punctuation or joining word) are one phrase.
 */
export function paragraphDrops(idea: string, para: string): string[] {
  const hay = paraStems(para)
  const out: string[] = []
  let run: { from: number; to: number } | null = null
  const close = () => { if (run) out.push(idea.slice(run.from, run.to)); run = null }
  for (const t of tokens(idea)) {
    if (t === 'brk') { close(); continue }
    if (t.stop) { if (CLAUSE.has(t.word.toLowerCase())) close(); continue }
    if (/^\d+$/.test(t.word) && t.word.length < 3) continue
    if (hasRun(hay, t.parts)) { close(); continue }
    run = run ? { from: run.from, to: t.at + t.word.length } : { from: t.at, to: t.at + t.word.length }
  }
  close()
  // she/he is a stop word, but the gender is a detail: a gendered idea needs a gendered paragraph
  const all = [...out, ...[FEMALE, MALE].flatMap((g) => (g.test(idea) && !g.test(para) ? [idea.match(g)![0]] : []))]
  return all.filter((p, i) => all.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i)
}

/** the retry's error line for a trimmed paragraph: what was dropped, and the rule */
export const paragraphError = (drops: readonly string[]) =>
  `logline: the brief paragraph left out the idea's words ${drops.map((d) => `"${d}"`).join(', ')}. Write the logline again as the full developed paragraph: every word of the idea kept (word for word where you can), with your additions around them; never trim, shorten or rephrase the idea's details away`

const leaves = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(leaves) : v && typeof v === 'object' ? Object.values(v).flatMap(leaves) : []

/**
 * A `developed` path that only repeats the idea (every content word of the field is the idea's: place.season "autumn", light.direction
 * "from behind her") is the idea's, not the AI's: the gate drops it from `developed`. A field with any word the idea did not have stays.
 */
export function statedPath(idea: string, value: unknown): boolean {
  const ideaStems = paraStems(idea)
  const words = leaves(value).flatMap((s) => tokens(s.replace(/@/g, ' ').replace(/_/g, ' '))).filter((t): t is Tok => t !== 'brk' && !t.stop)
  return words.length > 0 && words.every((t) => hasRun(ideaStems, t.parts))
}
