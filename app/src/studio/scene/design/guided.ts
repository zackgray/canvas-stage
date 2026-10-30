// The Guided route (mockup E): the stages' state (the stage table is guidedStages.ts), the brief that assembles live from the words
// and picks, and the pieces the picks become on the board. Pure.
//   Location, Light & mood and Story beats are words only: they draw nothing and become no tile; their words are the brief's.
//   Cast and Props are pieces, each drawn alone from its own words; a picked look lands on the board as an approved tile.
import type { GuidedStageId, PieceType } from '../briefApi'
import { runs } from './briefText'
import { GEN_MAX, GEN_MIN, GEN_MIN_CAST, GEN_N, type WordStageId } from './guidedStages'
import { mkPiece, slug, uniqTag, type Piece } from './model'

/** `cands` / `picks` are what an older scene drew on a word stage; nothing draws there now and they are never read */
export interface StageState { text: string; cands: string[]; picks: number[]; busy: boolean }
export interface CastCard {
  id: string; name: string; type: 'person' | 'creature' | 'group'; desc: string
  cands: string[]; pick: number | null; busy: boolean
  /** how many options the running press draws, fixed at the press (the stepper only sets the next one) */
  asked?: number
  /** a saved card or an existing piece used as is */
  fixed?: { tag: string; look: string | null; cardId?: string }
  /** the person maker's two boxes, each only once edited (absent: the server's DEFAULT_RULES, and its own head and tail) */
  rules?: string; framing?: string
}
/** one prop: its name, its own words (its materials live here, never in a scene line) and one tile picked */
export interface PropCard { id: string; name: string; desc: string; cands: string[]; pick: number | null; busy: boolean; asked?: number }
/** how many options one Generate press draws on the Cast and Props steps; absent on a scene saved before the count existed */
export interface GenCounts { cast: number; props: number }
/** the front door's one box: the user's own text, and (once Develop has filled the steps from it) what Develop said could not be
 *  done as written; `notes` is absent until a Develop answer landed for these words */
export interface SceneIdea { text: string; notes?: string[] }
/** `props` is absent on a scene saved before Props was a stage (propsOf reads it as none) */
export interface Guided { step: number; st: Record<GuidedStageId, StageState>; cast: CastCard[]; props?: PropCard[]; counts?: GenCounts; idea?: SceneIdea }

let uid = 0
export const castCard = (name = '', type: CastCard['type'] = 'person', desc = '', fixed?: CastCard['fixed']): CastCard =>
  ({ id: `c${++uid}`, name, type, desc, cands: [], pick: null, busy: false, ...(fixed ? { fixed } : {}) })
export const propCard = (name = '', desc = ''): PropCard => ({ id: `r${++uid}`, name, desc, cands: [], pick: null, busy: false })
const blankStage = (): StageState => ({ text: '', cands: [], picks: [], busy: false })
export const freshGuided = (cast: CastCard[] = [castCard()]): Guided =>
  ({ step: 0, st: { loc: blankStage(), cast: blankStage(), mood: blankStage(), mats: blankStage(), story: blankStage() }, cast, props: [], counts: { cast: GEN_N, props: GEN_N } })

/** the count one Generate press draws on a step, kept inside the bounds (people and creatures never fewer than a pair; an older
 *  scene without counts draws the default) */
export const genCount = (g: Pick<Guided, 'counts'> | null | undefined, kind: keyof GenCounts): number => {
  const n = g?.counts?.[kind] ?? GEN_N
  return Math.min(GEN_MAX, Math.max(kind === 'cast' ? GEN_MIN_CAST : GEN_MIN, Math.round(n)))
}

export const castTag = (c: CastCard) => c.fixed?.tag ?? slug(c.name || 'character')
export const castReady = (c: CastCard) => !!c.fixed || c.pick !== null
export const castPicked = (g: Guided) => g.cast.filter((c) => c.name.trim() && castReady(c))
export const propsOf = (g: Guided): PropCard[] => g.props ?? []
export const propTag = (p: PropCard) => slug(p.name || 'prop')
export const propPicked = (g: Guided) => propsOf(g).filter((p) => p.name.trim() && p.pick !== null)
/** a word stage's words (empty when nothing was written) */
export const words = (g: Guided, id: WordStageId | 'mats') => g.st[id].text.trim()

export type LiveRun = { text: string } | { tag: string; type: PieceType }

const sentence = (t: string) => { const s = t.trim().replace(/\s+/g, ' '); return s ? (/[.!?]$/.test(s) ? s : `${s}.`) : '' }
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

/** a picked thing the story can name: its tag, the words that name it, and other card words that name it (a cast card's role words) */
export interface NamedPick { tag: string; type: PieceType; name: string; also?: readonly string[] }

const TAGSPAN = /@([a-z][a-z0-9_-]*)/gi
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end
const wordRe = (w: string) => new RegExp(`\\b${esc(w)}s?\\b`, 'gi')
const phraseRe = (words: string[]) => new RegExp(`\\b${[...words.slice(0, -1).map(esc), `${esc(words.at(-1)!)}s?`].join('\\s+')}\\b`, 'gi')

/** regexes naming a pick from its name: the whole name, and (when its last word is long enough) that word on its own */
const nameRes = (phrase: string): RegExp[] => {
  const words = phrase.trim().split(/\s+/).filter(Boolean)
  const last = words.at(-1) ?? ''
  // a word under three characters never matches on its own ("a", "an" would tag every sentence)
  if (words.length > 1) return [phraseRe(words), ...(last.length >= 3 ? [wordRe(last)] : [])]
  return last.length >= 3 ? [wordRe(last)] : []
}
/**
 * Regexes naming a pick from its card's other words (a cast card's role line): the phrase as written, and — only when stripping
 * the article leaves a single role noun ("a beekeeper" -> "beekeeper") — that noun on its own, so a long role line never tags
 * an unrelated word it happens to end with.
 */
const alsoRes = (phrase: string): RegExp[] => {
  const words = phrase.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const rest = /^(a|an|the)$/i.test(words[0]) ? words.slice(1) : words
  return [...(words.length > 1 ? [phraseRe(words)] : []), ...(rest.length === 1 && rest[0].length >= 3 ? [wordRe(rest[0])] : [])]
}

/**
 * The story with EVERY mention of each pick replaced by its @tag (singular or plural; a multi-word name's last word on its own;
 * a cast card's role words from its card name it too, so "A beekeeper" becomes "@julia"). A mention already behind an @tag is left
 * alone, and a pick the story does not name is not written (the caller says "in the scene" for it). Returns the story and the
 * picks it now names.
 */
export function tagWhereNamed(story: string, picks: readonly NamedPick[]): { story: string; named: ReadonlySet<string> } {
  const named = new Set<string>()
  const taken: { start: number; end: number }[] = []
  for (const m of story.matchAll(TAGSPAN)) {
    taken.push({ start: m.index!, end: m.index! + m[0].length })
    if (picks.some((p) => p.tag === m[1].toLowerCase())) named.add(m[1].toLowerCase())
  }
  const hits: { start: number; end: number; tag: string }[] = []
  for (const p of picks) {
    if (named.has(p.tag)) continue
    const res = [...nameRes(p.name), ...(p.also ?? []).flatMap(alsoRes)]
    for (const re of res) {
      for (const m of story.matchAll(re)) {
        const end = m.index! + m[0].length
        let start = m.index!
        const span = { start, end }
        if (taken.some((t) => overlap(t, span)) || hits.some((h) => overlap(h, span))) continue
        // a leading article belongs to the mention ("A beekeeper" -> "@julia", not "A @julia"); keep the space before it
        const art = /(?:^|\s)(a|an|the)\s$/i.exec(story.slice(0, start))
        if (art) start -= art[1].length + 1
        hits.push({ start, end, tag: p.tag })
      }
    }
  }
  hits.sort((a, b) => b.start - a.start)
  let out = story
  for (const h of hits) out = out.slice(0, h.start) + `@${h.tag}` + out.slice(h.end)
  for (const p of picks) if (!named.has(p.tag) && hits.some((h) => h.tag === p.tag)) named.add(p.tag)
  return { story: out, named }
}

/** the picked cast cards and prop tiles as NamedPicks (a cast card's role line names it too) */
const pickedPicks = (g: Guided): NamedPick[] => [
  ...castPicked(g).map((c) => ({ tag: castTag(c), type: c.type as PieceType, name: c.name, ...(c.desc.trim() ? { also: [c.desc.trim()] } : {}) })),
  ...propPicked(g).map((p) => ({ tag: propTag(p), type: 'prop' as PieceType, name: p.name })),
]

/** "@a, @b and @c are in the scene." for the picks the story does not name (empty when it names them all) */
const inScene = (ps: readonly NamedPick[]) => (ps.length ? `${andList(ps.map((p) => `@${p.tag}`))} ${ps.length > 1 ? 'are' : 'is'} in the scene.` : '')

/**
 * The words and picks as the scene's brief, read as a brief: the place, the light and mood, who and what is in the scene (each
 * pick tagged where the story names it, else a clear "in the scene" sentence right before the story), then the story — one part
 * per line. Never the live preview's stage labels: they would be read as scene text by every prompt built from it.
 */
export function guidedLogline(g: Guided): string {
  const picks = pickedPicks(g)
  const told = tagWhereNamed(words(g, 'story'), picks)
  const left = picks.filter((p) => !told.named.has(p.tag))
  return [sentence(words(g, 'loc')), sentence(words(g, 'mood')), inScene(left), sentence(told.story)].filter(Boolean).join('\n')
}
/** the text the design's brief takes from Guided (the composed logline; the live preview keeps its labels for the reader only) */
export const liveBriefText = guidedLogline

/** The brief as it assembles, for the guided panel: the same composition as `guidedLogline`, each @tag a chip, a line per part. */
export function liveBrief(g: Guided): LiveRun[] {
  const picks = pickedPicks(g)
  const types = new Map(picks.map((p) => [p.tag, p.type]))
  const toRuns = (t: string): LiveRun[] => runs(t).map((r) => ('tag' in r ? { tag: r.tag, type: types.get(r.tag) ?? 'person' } : { text: r.text }))
  const told = tagWhereNamed(words(g, 'story'), picks)
  const left = picks.filter((p) => !told.named.has(p.tag))
  const parts: LiveRun[][] = []
  const say = (id: WordStageId) => { if (words(g, id)) parts.push([{ text: sentence(words(g, id)) }]) }
  say('loc')
  say('mood')
  if (left.length) parts.push(toRuns(inScene(left)))
  if (words(g, 'story')) parts.push(toRuns(sentence(told.story)))
  return parts.flatMap((p, i) => (i ? [{ text: '\n' }, ...p] : p))
}
/** something to build from: words on a stage, or a picked cast card or prop tile */
export const anyPick = (g: Guided) => (['loc', 'mood', 'story'] as const).some((id) => !!words(g, id)) || castPicked(g).length > 0 || propPicked(g).length > 0

/**
 * What the board receives: one approved tile per picked cast card and prop (the word stages add none); the lighting line from the
 * light's words, and the materials line from whatever an older scene typed on its Materials stage. The story beats stay the brief's
 * words: they are never the Bible's background action line, which every still and Render prompt carries (wave 3 M4), so `action`
 * is always empty here; one written elsewhere is kept by finishGuided. A prop's line is its own words only.
 */
export function guidedPieces(g: Guided, keep: readonly Piece[]): { pieces: Piece[]; lighting: string; materials: string; action: string } {
  const out: Piece[] = []
  const taken = () => [...keep.map((p) => p.tag), ...out.map((p) => p.tag)]
  const ap = { state: 'approved' as const, onBoard: true }
  for (const c of castPicked(g)) {
    if (c.fixed && keep.some((p) => p.tag === c.fixed!.tag)) continue
    const url = c.pick !== null ? c.cands[c.pick] : c.fixed?.look ?? null
    out.push(mkPiece(c.fixed?.tag ?? uniqTag(castTag(c), taken()), c.name.trim(), c.type,
      { ...ap, state: c.fixed ? 'yours' : 'approved', looks: url ? [url] : [], line: c.desc.trim(), ...(c.fixed?.cardId ? { cardId: c.fixed.cardId } : {}) }))
  }
  for (const p of propPicked(g)) out.push(mkPiece(uniqTag(propTag(p), taken()), p.name.trim(), 'prop', { ...ap, looks: [p.cands[p.pick!]], line: p.desc.trim() }))
  return { pieces: out, lighting: words(g, 'mood'), materials: words(g, 'mats'), action: '' }
}
