// The front door's Develop answer onto the Guided steps (the other way from guidedV2.ts). Pure.
//   place -> Location; the key light, its effect and what is in the air -> Light & mood; person, creature and group elements -> cast
//   cards and prop elements -> prop cards, each a DRAFT with its look line as its words and nothing drawn; the beats -> Story beats,
//   each written with the element's name (the picks tag it again once drawn, tagWhereNamed), the paragraph itself when there are none.
//   A stage the answer leaves empty keeps what was typed there; a card that already has drawn options, a pick or a saved look is
//   kept as it is (paid work is never thrown away) and Develop adds no second card of the same name. Nothing here draws or spends.
//   developedWords: the same steps as the scene words the drawer shows (the Stage's setup reads the cards beside them).
import { BRIEF_LEFT_OUT, type BriefElement, type BriefWarning, type SceneBrief } from '../../../shared/bibleContract'
import type { BriefElementV2, BriefLight, BriefPlace, SceneBriefV2 } from '../../../shared/briefContract'
import { castCard, guidedLogline, propCard, propsOf, words, type CastCard, type Guided, type PropCard } from './guided'

type Element = BriefElement & Partial<Pick<BriefElementV2, 'materials' | 'condition' | 'face'>>
const CAST = new Set(['person', 'creature', 'group'])
const clean = (t: string | undefined) => (t ?? '').trim().replace(/\s+/g, ' ')
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t)
const sentence = (t: string) => { const s = clean(t).replace(/[,;:]$/, ''); return s ? cap(/[.!?]$/.test(s) ? s : `${s}.`) : '' }
const sentences = (xs: (string | undefined)[]) => xs.map((x) => sentence(x ?? '')).filter(Boolean).join(' ')
const list = (xs: (string | undefined)[]) => xs.map(clean).filter(Boolean).join(', ')
const joined = (xs: (string | undefined)[]) => xs.map(clean).filter(Boolean).join(' ')

/** a prop named inside a sentence: "Copper kettle" -> "the copper kettle" (the article joins the mention when it is tagged) */
const thing = (name: string) => { const n = clean(name); return /^(a|an|the)\s/i.test(n) ? n.replace(/^\w+/, (w) => w.toLowerCase()) :`the ${n.charAt(0).toLowerCase()}${n.slice(1)}` }

/** every @tag in a line as the element's name ("@lamp_post" -> "the lamp post" when no element names it) */
const untag = (t: string, names: ReadonlyMap<string, string>) =>
  t.replace(/@([a-z][a-z0-9_-]*)/gi, (_, tag: string) => names.get(tag.toLowerCase()) ?? tag.replace(/[_-]+/g, ' '))

export const placeWords = (p: Partial<BriefPlace> | undefined) => sentence(list([p?.setting, p?.period, p?.season, p?.time, p?.weather]))

export function lightWords(l: Partial<BriefLight> | undefined, air: SceneBriefV2['atmosphere'] | undefined): string {
  const key = list([l?.key, l?.direction, l?.colour, l?.quality ? `${l.quality} light` : ''])
  return sentences([key, l?.others ? `Also ${l.others}` : '', l?.effect, ...(air ?? []).map((a) => joined([a?.what, a?.where]))])
}

/** what Develop said it could not do as written, as one plain line for under the box */
function noteOf(w: Partial<BriefWarning>): string {
  const what = clean(w.element)
  if (clean(w.issue).startsWith(BRIEF_LEFT_OUT)) return what ? sentence(`${what} is in your text but not in the steps: add it where it belongs`) : ''
  return sentence(joined([what && `${what}:`, w.issue, w.swap && `(instead: ${clean(w.swap)})`]))
}

/** a card's own words: what it looks like, then (people) the face and (props) what it is made of and its condition */
const castWords = (e: Element) => sentences([e.look, e.face])
const propWords = (e: Element) => sentences([e.look, e.materials, e.condition])

/** the beats as the story, one sentence each, the performer named ("Mara crosses the yard."); the paragraph when there are none */
function storyWords(b: SceneBrief, v2: SceneBriefV2 | undefined, names: ReadonlyMap<string, string>): string {
  const beats = v2?.beats?.length
    ? v2.beats.map((x) => untag(`${clean(x?.who)} ${clean(x?.does)}`, names))
    : (b.beats ?? []).map((x) => untag(x, names))
  const told = sentences(beats)
  return told || sentence(untag(v2?.logline ?? b.brief ?? '', names))
}

const sameName = (a: string, b: string) => clean(a).toLowerCase() === clean(b).toLowerCase()
const castKept = (c: CastCard) => !!c.fixed || c.cands.length > 0 || c.pick !== null
const propKept = (p: PropCard) => p.cands.length > 0 || p.pick !== null

/** true when the five steps already hold words or a card: Develop asks before it replaces them */
export const guidedHasWords = (g: Guided) =>
  (['loc', 'mood', 'story'] as const).some((id) => !!g.st[id].text.trim())
  || g.cast.some((c) => !!(c.name.trim() || c.desc.trim()) || castKept(c)) || propsOf(g).some((p) => !!(p.name.trim() || p.desc.trim()) || propKept(p))

/** a card's name as said in the words: a person as named, a prop as "the copper kettle" */
const said = (c: { name: string }, prop: boolean) => (prop ? thing(c.name) : clean(c.name))
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const names = (t: string, name: string) => new RegExp(`\\b${clean(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)

/**
 * The scene words Develop leaves in the drawer: the composed brief (guidedLogline: the place, the light and mood, the picked people
 * and props, the story), with every named person and prop card the words do not name yet said by name in one "are in the scene"
 * line before the story, so the drawer lists everyone Develop found.
 */
export function developedWords(g: Guided): string {
  const lines = guidedLogline(g).split('\n')
  const all = lines.join(' ')
  const left = [...g.cast.filter((c) => !c.fixed && c.pick === null).map((c) => ({ c, prop: false })),
    ...propsOf(g).filter((p) => p.pick === null).map((c) => ({ c, prop: true }))]
    .filter(({ c }) => clean(c.name) && !names(all, c.name)).map(({ c, prop }) => said(c, prop))
  if (!left.length) return lines.join('\n')
  const line = cap(`${andList(left)} ${left.length > 1 ? 'are' : 'is'} in the scene.`)
  const story = words(g, 'story') ? lines.length - 1 : lines.length
  return [...lines.slice(0, story), line, ...lines.slice(story)].filter(Boolean).join('\n')
}

/** the steps filled from one Develop answer, back on the first step for review; the box keeps the user's words */
export function developedGuided(g: Guided, b: SceneBrief): Guided {
  const v2 = b.v2
  const elements: Element[] = (v2?.elements ?? b.elements ?? []).filter((e) => clean(e?.name))
  const names = new Map(elements.map((e) => [clean(e.tag).toLowerCase(), e.type === 'prop' ? thing(e.name) : clean(e.name)]))
  const keptCast = g.cast.filter(castKept), keptProps = propsOf(g).filter(propKept)
  const cast = [...keptCast, ...elements.filter((e) => CAST.has(e.type) && !keptCast.some((c) => sameName(c.name, e.name)))
    .map((e) => castCard(clean(e.name), e.type as CastCard['type'], castWords(e)))]
  const props = [...keptProps, ...elements.filter((e) => e.type === 'prop' && !keptProps.some((p) => sameName(p.name, e.name)))
    .map((e) => propCard(clean(e.name), propWords(e)))]
  const words = { loc: placeWords(v2?.place), mood: v2 ? lightWords(v2.light, v2.atmosphere) : sentence(b.lighting ?? ''), story: storyWords(b, v2, names) }
  const st = { ...g.st }
  for (const id of ['loc', 'mood', 'story'] as const) if (words[id]) st[id] = { ...st[id], text: words[id] }
  const notes = (v2?.warnings ?? b.warnings ?? []).map((w) => noteOf(w ?? {})).filter(Boolean)
  return { ...g, step: 0, st, cast: cast.length ? cast : [castCard()], props, idea: { text: g.idea?.text ?? '', notes } }
}
