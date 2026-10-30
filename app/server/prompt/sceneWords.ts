/**
 * The scene words as a prompt says them (stage-only plan, section 5: the scene words lead both prompts). Consumers: the draw
 * (server/hero/kitStillPrompt.ts), the render (server/l2r/stagedDefault.ts) and a render override (server/l2r/compose.ts). The text
 * is the drawer's, as the Bible keeps it (the scene prompt); every @tag is said in words: its first mention by its card's
 * description (one tag rule, owner 10-29: swapFirst), every later mention and a tag with no card by its name
 * (src/shared/tagWords.ts). It never deletes a user's word
 * except a mention of a cast member who is not on the set (dropMentions; naming one grew an unstaged person out of the clay,
 * E137/E138); the user's own exclusions ("no people") stay. The Guided stepper's label stripper (unlabel.ts) is NOT run here: nothing
 * writes those labels into the words any more, so on these words it could only cut the user's own "Set in …", "Cast: …",
 * "Lighting: …" (stage-only review F1). It stays in the no-words fallbacks, which read old Bibles. Pure.
 */
import { BIBLE_TAG_RE } from '../../src/shared/bibleContract.ts'
import { tagWords } from '../../src/shared/tagWords.ts'
import { objectWords } from './objectWords.ts'

/**
 * a cast card's generation description opens with how it was drawn, not who the person is: "A detailed character concept sheet for
 * a futuristic driver …" -> "a futuristic driver …". The trailing article stays ("for a driver" keeps its "a").
 */
export const stripOpener = (d: string): string =>
  d.replace(/^\s*(?:a|an|the)\s+(?:(?:detailed|full[- ]length)\s+)?(?:(?:character|reference|concept|model)\s+)?(?:concept\s+)?(?:sheet|photo|photograph|reference|portrait|image|render)\s+(?:of|for)\s+/i, '')

/**
 * who a person is, short and whole: the card's description, its opener off, up to the end of its first whole sentence (a stop
 * followed by a space or the end; never a cut at a comma or a word count), without the stop, a leading article lower-cased.
 * "A cook in a white apron, sleeves rolled. She hums." -> "a cook in a white apron, sleeves rolled". No description: the name.
 */
export function whoPhrase(card: { name?: string; description: string }): string {
  const d = stripOpener((card.description ?? '').trim()).replace(/\s+/g, ' ').trim()
  const first = (/^.*?[.!?](?=\s|$)/.exec(d)?.[0] ?? d).replace(/[.!?]+$/, '').trim()
  return first ? first.replace(/^(A|An|The)\b/, (m) => m.toLowerCase()) : (card.name ?? '').trim()
}

/**
 * `text` without the mentions of `gone` @tags. A clause that names a `gone` tag and a staged person loses only the mention;
 * one that names a `gone` tag and set pieces keeps the pieces as a bare mention ("@steam_train."), so their lines still join
 * the prompt; one that names only `gone` tags is dropped. The sentence stays tidy (review F6): a pair's verb is said of the one who
 * stays ("@ana and @bo argue" -> "@ana argues"), and a dropped clause that ended its sentence passes its stop to the clause before.
 */
export function dropMentions(text: string, gone: string[], staged: string[]): string {
  if (!gone.length || !text) return text
  const names = (s: string) => [...s.matchAll(BIBLE_TAG_RE)].map((m) => m[1])
  const kept: string[] = []
  for (const clause of onePerson(text, gone, staged).split(/(?<=[,;:.!?])\s+/)) {
    const tags = names(clause)
    if (!tags.some((t) => gone.includes(t))) { kept.push(clause); continue }
    if (tags.some((t) => staged.includes(t))) {
      let c = clause
      for (const t of gone) c = c.replace(new RegExp(`(\\s*,|\\s+and)?\\s*@${t}\\b(\\s*,|\\s+and\\b)?`, 'g'), (_m, a, b) => (a && b ? ',' : ''))
      kept.push(c.replace(/\s{2,}/g, ' ').trim())
      continue
    }
    const pieces = [...new Set(tags.filter((t) => !gone.includes(t)))]
    if (pieces.length) { kept.push(`${pieces.map((t) => `@${t}`).join(' and ')}.`); continue }
    // the clause goes; when it ended its sentence, the clause before it now does (review F6: never a stray ";." or ", .")
    const stop = /[.!?]$/.exec(clause.trim())?.[0]
    if (stop && kept.length) kept.push(kept.pop()!.replace(/\s*[,;:]$/, stop))
  }
  return kept.join(' ')
}

// a verb said of one person instead of two: "argue" -> "argues", "are" -> "is" (review F6)
const ONE: Record<string, string> = { are: 'is', were: 'was', have: 'has', do: 'does', go: 'goes' }
const NOT_VERB = /^(?:the|a|an|both|all|together|each|then|now|still|also|just|never|always|at|in|on|by|with|from|to|of|into|onto|for|as)$/i
function singular(v: string): string {
  if (ONE[v.toLowerCase()]) return ONE[v.toLowerCase()]
  if (NOT_VERB.test(v) || !/^[a-z]+$/.test(v) || /(?:s|ly|ed|ing)$/.test(v)) return v
  if (/(?:sh|ch|x|z|o)$/.test(v)) return `${v}es`
  if (/[^aeiou]y$/.test(v)) return `${v.slice(0, -1)}ies`
  return `${v}s`
}

/** "@ana and @bo argue" with @bo gone and @ana staged: the pair's verb is said of one ("@ana argues"); a longer list ("@x, @ana and
 *  @bo") is left plural */
function onePerson(text: string, gone: string[], staged: string[]): string {
  return text.replace(/(@[a-z][a-z0-9_-]*)\s+and\s+(@[a-z][a-z0-9_-]*)\s+(?:both\s+)?([A-Za-z]+)\b/gi, (m, a: string, b: string, verb: string, at: number, all: string) => {
    const g = (t: string) => gone.includes(t.slice(1)), s = (t: string) => staged.includes(t.slice(1))
    if (!((g(a) && s(b)) || (s(a) && g(b))) || /(?:,|\band)\s*$/i.test(all.slice(0, at))) return m
    return `${a} and ${b} ${singular(verb)}`
  })
}

export interface SceneWordsOpts {
  /** the Bible's elements; a `kind: 'cast'` one is a person (its capitalised name is said as a name) */
  elements: readonly { tag: string; name?: string; type?: string; kind?: string }[]
  /** tag -> its card's description (a person's Cast card, a prop's or material's own line), for the tag's first mention */
  cards?: Readonly<Record<string, string>>
  /** only each description's first whole sentence (the render, when the whole cards would run past its length guideline) */
  short?: boolean
  /** cast tags not on the set, and the tags that are (dropMentions) */
  drop?: readonly string[]
  staged?: readonly string[]
}

// the article rule of src/shared/tagWords.ts, for a description
const DET = /(?:^|[\s(])(a|an|the|his|her|their|its|this|that|these|those|my|your|our|one|each|every|another|some|any|no)\s+$/i
const ARTICLE = /^(the|a|an)\s+/i
const TAG = /(?<![A-Za-z0-9_])@([a-z][a-z0-9_-]*)/gi
/** a card's description as whole sentences, its drawing opener off ("A detailed character sheet for …") */
const sentencesOf = (d: string): string[] => stripOpener(d.trim()).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
const stop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`)

/**
 * The one tag rule (owner 10-29), for the first draw, the render and an override alike: each @tag is replaced once, where it is
 * typed, by its card's description. A determiner before the tag ("his @car") takes the description without its own article; at a
 * sentence start it keeps its capital, mid-sentence its article is lower-cased; its last stop goes while the sentence carries on.
 * A description of several sentences puts its first where the tag is and the rest right after the end of that sentence, so the
 * user's sentence is never cut in two. A later mention, and a tag with no description, stays a tag (tagWords names it).
 */
function swapFirst(text: string, cards: ReadonlyMap<string, string>, short: boolean): string {
  const said = new Set<string>()
  const edits: { at: number; end: number; text: string }[] = []
  for (const m of text.matchAll(TAG)) {
    const key = m[1].toLowerCase(), desc = cards.get(key)
    if (!desc || said.has(key)) continue
    said.add(key)
    const [head, ...more] = sentencesOf(desc)
    if (!head) continue
    const at = m.index ?? 0, end = at + m[0].length
    const before = text.slice(0, at), after = text.slice(end)
    const art = ARTICLE.exec(head)
    let p = (art && DET.test(before) ? head.slice(art[0].length) : head).replace(/[.!?]+$/, '')
    p = !before.trim() || /[.!?]\s*$/.test(before) ? `${p[0].toUpperCase()}${p.slice(1)}` : p.replace(/^(A|An|The)\b/, (w) => w.toLowerCase())
    edits.push({ at, end, text: p })
    const rest = short ? [] : more
    if (!rest.length) continue
    // the rest of the card follows the end of the sentence the tag is in (or the end of the words, given its own stop)
    const s = /[.!?](?=\s|$)/.exec(after)
    if (s) edits.push({ at: end + s.index + 1, end: end + s.index + 1, text: ` ${rest.map(stop).join(' ')}` })
    else edits.push({ at: text.length, end: text.length, text: `${/[.!?]\s*$/.test(text) ? '' : '.'} ${rest.map(stop).join(' ')}` })
  }
  let out = text
  for (const e of [...edits].sort((a, b) => b.at - a.at || b.end - a.end)) out = `${out.slice(0, e.at)}${e.text}${out.slice(e.end)}`
  return out
}

/** the scene words with their tags said in words (see the header and swapFirst) */
export function sceneWords(text: string, o: SceneWordsOpts): string {
  const kept = dropMentions(text ?? '', [...(o.drop ?? [])], [...(o.staged ?? [])])
  const cards = new Map(Object.entries(o.cards ?? {}).filter(([, d]) => d.trim()).map(([t, d]) => [t.toLowerCase(), d.trim()]))
  const named = o.elements.map((e) => ({ tag: e.tag, name: e.name, type: e.kind === 'cast' ? 'person' : e.type }))
  return tagWords(swapFirst(kept, cards, !!o.short), named).replace(/\s+/g, ' ').trim()
}

/** every tag's card description on a sheet: a person's or creature's Cast card (`descriptions` by card id), else the element's own
 *  line (a prop, a material). `over`: descriptions that win (the hero's card as the press resolved it) */
export function elementCards(elements: readonly { tag: string; cardId?: string; line?: string }[], descriptions: Readonly<Record<string, string>> = {},
  over: Readonly<Record<string, string>> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of elements) {
    const d = (over[e.tag] ?? (e.cardId ? descriptions[e.cardId] : '') ?? '').trim() || ((e.line ?? '').trim() ? objectWords((e.line ?? '').trim(), e.tag) : '')
    if (d) out[e.tag] = d
  }
  return out
}

/** the words of a prompt string (the render's length guideline counts them) */
export const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length
