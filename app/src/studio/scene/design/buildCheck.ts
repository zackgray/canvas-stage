// What Build the set sends and what it checks first, free (wave 3 M1, M2). Pure.
//   planSentence: the planner's one scene sentence. The planner holds it to PLAN_LIMITS.sentence (600) while Develop writes briefs
//     up to 1500, so it is the brief's place sentences untagged and clipped there; the Bible keeps the whole prompt.
//   bibleWrite: the Bible's lines and elements as writeBible sends them (the same clips), so the server's check sees exactly that.
//   buildBlock: why Build the set cannot run yet, said on the button before anything is pressed.
//   planProps, buildDesign: what the Stage's Build the set plans and writes (the tiles as they are, the Guided props as words).
import { untag, type BibleCheckRequest, type BibleElement } from '../../../shared/bibleContract'
import { propsClause, type PlanProp } from '../../../stage3d/planProps'
import { LIMITS as PLAN_LIMITS } from '../../../stage3d/planRules'
import { bibleBrief, flatTouched } from './briefV2'
import { biblePrompt, runs } from './briefText'
import { castTag, propsOf, propTag } from './guided'
import { guidedV2 } from './guidedV2'
import { done, elementKindOf, isCastFront, lookOf, uniqTag, type Piece } from './model'
import type { Design } from './state'

/** the Bible's own limits (server/bible/validate.ts LIMITS) */
export const BIBLE_LIMITS = { prompt: 4000, line: 600, lighting: 400, materials: 400, background: 300 } as const
export const PLAN_SENTENCE = PLAN_LIMITS.sentence

export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const publicRef = (u: string | null) => (u && /^\/[A-Za-z0-9_\-./%]+$/.test(u) && !u.split('/').includes('..') ? [u] : [])
const sentences = (t: string) => t.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((x) => x.trim()).filter(Boolean) ?? []

/** a board tile as a Bible element (null for the look types, which live in the prompt's words) */
export function elementOfPiece(p: Piece): BibleElement | null {
  const kind = elementKindOf(p.type)
  if (!kind) return null
  return { tag: p.tag, kind, refs: publicRef(lookOf(p)), line: clip(p.line.trim() || p.name, BIBLE_LIMITS.line), ...(p.cardId ? { cardId: p.cardId } : {}) }
}

/** every prop tile on the board, by tag and name with its own words: the planner is told each one (propsClause) */
export const boardProps = (pieces: readonly Piece[]): PlanProp[] => pieces.filter((p) => p.onBoard && p.type === 'prop').map((p) => ({ tag: p.tag, name: p.name, line: p.line }))

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
/**
 * Every prop the planner places a stand-in for: the prop tiles, then each named Guided prop card that has no tile of its name yet
 * (Develop's props stay words until one is given a look on the Stage), under a tag of its own: the Develop brief's tag for that
 * name when it is free, else one made from its name.
 */
export function planProps(d: Pick<Design, 'pieces' | 'guided' | 'v2'>): PlanProp[] {
  const tiles = boardProps(d.pieces)
  const taken = [...d.pieces.map((p) => p.tag)]
  const cards: PlanProp[] = []
  for (const c of d.guided ? propsOf(d.guided) : []) {
    const name = c.name.trim()
    if (!name || tiles.some((t) => sameName(t.name, name)) || cards.some((t) => sameName(t.name, name))) continue
    const brief = d.v2?.elements.find((e) => e.type === 'prop' && sameName(e.name, name))?.tag
    const tag = brief && !taken.includes(brief) ? brief : uniqTag(propTag(c), taken)
    taken.push(tag)
    cards.push({ tag, name, line: c.desc.trim() })
  }
  return [...tiles, ...cards]
}

/**
 * The design Build the set builds (the Stage's own, as it stands): its tiles as they are, never replaced by Guided picks; its v2
 * brief is Develop's when it has one, else made from the Guided words and the tiles (guidedV2), else none.
 */
export function buildDesign(d: Design): Design {
  if (d.v2 || !d.guided) return d
  return { ...d, v2: guidedV2(d.guided, d.pieces, null) }
}
/** the room the Props list may take of the planner's sentence; the place keeps the rest */
const PROPS_ROOM = 260

/**
 * The planner's scene sentence: the Bible prompt without its tags, then a Props list naming every prop on the board (so each can
 * be a stand-in piece in the clay). Over the limit, the place sentences (those naming no cast, creature or group) come first, in
 * order, then the rest while they fit; a single sentence too long is cut at a word.
 */
export function planSentence(brief: string, pieces: readonly Piece[], limit: number = PLAN_SENTENCE, listed: readonly PlanProp[] = boardProps(pieces),
  names?: ReadonlyMap<string, string>): string {
  const prompt = biblePrompt(brief, pieces, names)
  const whole = untag(prompt).replace(/\s+/g, ' ').trim()
  const props = propsClause(listed, Math.min(PROPS_ROOM, limit - 40))
  const room = limit - props.length
  if (whole.length <= room) return whole + props
  const castTags = new Set(pieces.filter((p) => isCastFront(p.type) || p.type === 'group').map((p) => p.tag))
  const all = sentences(prompt).map((s, i) => ({ i, place: !runs(s).some((r) => 'tag' in r && castTags.has(r.tag)), text: untag(s).trim() }))
  const keep: typeof all = []
  const len = (xs: typeof all) => xs.map((x) => x.text).join(' ').length
  for (const s of [...all.filter((x) => x.place), ...all.filter((x) => !x.place)]) if (len([...keep, s]) <= room) keep.push(s)
  const out = keep.sort((a, b) => a.i - b.i).map((s) => s.text).join(' ')
  return (out || whole.slice(0, room + 1).replace(/\s+\S*$/, '').trim().slice(0, room)) + props
}

/** the names the scene gives its tags without a tile: the Develop brief's elements, then the Guided people's and props' cards */
export function tagNames(d: Pick<Design, 'v2' | 'guided'>): ReadonlyMap<string, string> {
  const out = new Map<string, string>()
  const put = (tag: string, name: string) => { if (name.trim() && !out.has(tag)) out.set(tag, name.trim()) }
  for (const e of d.v2?.elements ?? []) put(e.tag, e.name)
  for (const c of d.guided?.cast ?? []) put(castTag(c), c.name)
  for (const p of d.guided ? propsOf(d.guided) : []) put(propTag(p), p.name)
  return out
}

/** the design as the Bible would hold it: the lines writeBible saves and one element per tile that is one */
export function bibleWrite(d: Design): BibleCheckRequest {
  const sheet = d.pieces.filter((p) => p.onBoard && p.type === 'group').map((p) => publicRef(lookOf(p))[0]).find(Boolean)
  const brief = bibleBrief(d.v2, d.brief, d.pieces)
  // a brief with its light, elements or background edited by hand derives those lines on the server (they would be stale here)
  const derived = !!brief && flatTouched(brief)
  return {
    prompt: clip(biblePrompt(d.brief, d.pieces, tagNames(d)), BIBLE_LIMITS.prompt),
    ...(derived ? {} : { lighting: clip(d.lighting, BIBLE_LIMITS.lighting), materials: clip(d.materials, BIBLE_LIMITS.materials) }),
    ...(d.action.trim() && !derived ? { background: clip(d.action.trim(), BIBLE_LIMITS.background) } : {}),
    ...(brief ? { brief } : {}),
    // a group tile's look is the extras sheet (one picture of 6-8 figures, drawn as seven)
    ...(sheet ? { extrasSheet: { png: sheet, variants: 7 } } : {}),
    elements: d.pieces.flatMap((p) => { const el = p.onBoard ? elementOfPiece(p) : null; return el ? [el] : [] }),
  }
}

/**
 * Why Build the set cannot run yet (null = it can), free to find: the scene words are empty, or a tile in the scene is still a
 * draft. Nothing else: a set is built from the words alone (the planner places stand-ins; people get their look once it exists),
 * and whatever the scene sheet would refuse is found by the free check after this.
 */
export function buildBlock(d: Design, board: readonly Piece[]): string | null {
  if (!untag(biblePrompt(d.brief, d.pieces)).trim()) return 'Write the scene words first: the set is built from them'
  const open = board.filter((p) => !done(p))
  if (open.length) return `Approve every tile first: ${open.map((p) => `@${p.tag}`).join(' ')} ${open.length === 1 ? 'is' : 'are'} still a draft`
  return null
}
