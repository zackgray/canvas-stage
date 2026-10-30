// Use this look (free): a picked look of a Guided cast card becomes the scene's person, through the Stage's one design copy.
// In order, each step safe to repeat, so Try again runs the whole chain again and finds what is already done:
//   (a) the tag: the Develop brief's for that name (the beats' @tag then matches), else the person tile's own, else a new unique one
//   (b) an approved person tile with the look (the words are not given its tag here), and the Guided card marked as used
//   (c) its Cast card saved by the design's own saver (awaited: the tile gets its card id)
//   (d) its sheet element (kind cast, the look, the card id)
//   (e) the performer: on a fresh read of the world, when nobody plays the subject or this person was asked to; never a costume
//   (f) the words: a mention of the person by name or role becomes the @tag; a Develop brief without them gets their element
// A failure stops at its step and says which; the paid looks stay on the card whatever fails.
import type { KitPerformance } from '../../../../server/stage3d/types'
import type { BriefElementV2 } from '../../../shared/briefContract'
import { elementOfPiece } from '../../scene/design/buildCheck'
import { castTag, tagWhereNamed, type CastCard } from '../../scene/design/guided'
import { lookOf, mkPiece, uniqTag, type Piece } from '../../scene/design/model'
import { beatPersons, storyBeats, storyPart } from '../../scene/design/storyBeats'
import type { StageScene } from './StageScene'

export type LookStep = 'tag' | 'tile' | 'card' | 'element' | 'performer' | 'words'
const STEP: Record<LookStep, string> = {
  tag: 'Reading the tags the scene already uses', tile: 'Adding them to the scene', card: 'Saving their Cast card',
  element: 'Writing them into the scene sheet', performer: 'Making them play the subject', words: 'Naming them in the scene words',
}
/** the Develop brief holds at most this many elements (server/planner/briefFields.ts BRIEF_LIMITS) */
const BRIEF_ELEMENTS = 8

export class LookFailed extends Error {
  readonly step: LookStep
  constructor(step: LookStep, cause: unknown) {
    super(`${STEP[step]} did not work: ${cause instanceof Error ? cause.message : String(cause)}. Their looks are kept; Try again is free.`)
    this.step = step
  }
}
async function step<T>(name: LookStep, f: () => Promise<T> | T): Promise<T> {
  try { return await f() } catch (e) { throw e instanceof LookFailed ? e : new LookFailed(name, e) }
}
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** (e) alone, the free "Plays the subject": the card plays the world's performer, onto the performance the server has now */
export async function playSubject(st: Pick<StageScene, 'kit'>, worldId: string, cardId: string, force = true): Promise<void> {
  const fresh = await st.kit.get(worldId)
  if (fresh.perf.castId === cardId || (fresh.perf.castId && !force)) return
  const perf: KitPerformance = { ...fresh.perf, castId: cardId }
  await st.kit.savePerf(worldId, perf)
}

/** `play`: this person plays the subject even when someone already does (else only when nobody does) */
export async function takeLook(st: StageScene, worldId: string, cardId: string, url: string, play = false): Promise<void> {
  const { s, c, bible } = st.x
  const card: CastCard | undefined = s.ref.current.guided?.cast.find((k) => k.id === cardId)
  if (!card) throw new LookFailed('tag', new Error('that person is no longer in the scene'))
  const name = card.name.trim() || 'Someone'
  const line = card.desc.trim()

  const tag = await step('tag', async () => {
    const d = s.ref.current
    if (card.fixed?.tag) return card.fixed.tag
    const brief = d.v2?.elements.find((e) => e.type === 'person' && same(e.name, name))
    if (brief) return brief.tag
    const tile = d.pieces.find((p) => p.type === 'person' && !p.cardId && (p.tag === castTag(card) || same(p.name, name)))
    if (tile) return tile.tag
    const sheet = worldId && bible ? (await bible.get(worldId)).bible?.elements ?? [] : []
    return uniqTag(castTag(card), [...d.pieces.map((p) => p.tag), ...sheet.map((e) => e.tag)])
  })

  const tile = await step('tile', () => {
    const was = s.ref.current.pieces.find((p) => p.tag === tag)
    let t: Piece
    if (!was) {
      t = mkPiece(tag, name, 'person', { looks: [url], state: 'approved', onBoard: true, line })
      s.addPiece(t, false)
    } else if (lookOf(was) !== url || was.state === 'draft' || !was.onBoard) {
      const patch = { looks: [url], look: 0, state: 'approved' as const, onBoard: true, line: line || was.line }
      s.patchPiece(was.id, patch)
      t = { ...was, ...patch }
    } else t = was
    const pick = card.cands.indexOf(url)
    c.patchCard(cardId, { fixed: { tag, look: url, ...(t.cardId ? { cardId: t.cardId } : {}) }, ...(pick >= 0 ? { pick } : {}) })
    return t
  })

  const saved = await step('card', async () => {
    const [p] = await c.cards([tile])
    if (!p?.cardId) throw new Error('no card id came back')
    c.patchCard(cardId, { fixed: { tag, look: url, cardId: p.cardId } })
    return p
  })

  await step('element', async () => {
    const el = elementOfPiece(saved)
    if (!el || !bible) throw new Error('there is no scene sheet to write to')
    await bible.putElement({ worldId, element: el })
  })

  await step('performer', () => playSubject(st, worldId, saved.cardId!, play))

  // one change on the design as it is now (its copy in ref may not have the new tile yet): the brief edit re-derives the beats as
  // a hand edit does, and the Develop brief gains the person when it lacks them; the sheet is then written (useV2Save)
  await step('words', () => s.set((y) => {
    const story = tagWhereNamed(y.brief, [{ tag, type: 'person', name, ...(line ? { also: [line] } : {}) }]).story
    const el: BriefElementV2 = { name: name.slice(0, 60), tag, type: 'person', look: line || name, supported: true, materials: '', condition: '', face: '' }
    const v2 = y.v2 && !y.v2.elements.some((e) => e.tag === tag) && y.v2.elements.length < BRIEF_ELEMENTS ? { ...y.v2, elements: [...y.v2.elements, el] } : y.v2
    if (story === y.brief && v2 === y.v2) return {}
    const beats = v2 && story !== y.brief ? storyBeats(storyPart(story), beatPersons(y.pieces, v2)) : []
    return { ...(story !== y.brief ? { brief: story, edited: true } : {}), ...(v2 ? { v2: beats.length ? { ...v2, beats } : v2, v2Stale: true } : {}) }
  }))
}
