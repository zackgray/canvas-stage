/**
 * The draw prompt of a kit still and of the master (Qwen-Image 2512 held to the clay's depth, so it takes no image).
 * (owner 10-29) The user's words go as written: the Bible's scene prompt, the drawer's words, with each @tag replaced once by its
 * card (stillWords.ts, the one tag rule). The app adds only the Stage's own layout, all geometry and all shown at the press ("What
 * will be sent"): the pose at this frame when it is a clip's own phase (stillAction.ts), each figure's size and place (E130: these
 * keep the hero at the clay's size), the angle, the lens feel, the pieces in view, the cut-at-the-top line; the brief's style last.
 * A hero the words never tag is described once, by the card, after the words. No photo lead, no second copy of the card, no
 * alone line: the owner rejected each as a silent addition.
 * A Bible with no scene words draws from the scene brief v2 (prompt wave, 2026-10-25) in Qwen's shape: "<the card>, <the action at
 * this frame>, in <the place, whole>." (the hero's beat, else the take's written action, else the motion word: stillBrief.ts
 * heroAction), the figures and the camera, the pieces with the brief's materials (pieceNames.ts), the brief's one key light and its
 * atmosphere, the style; with no v2 brief, the scene prompt's first clause is the place. The master (`mode: 'master'`, which no
 * Stage press draws) is the place with nobody in it, "Photo of …", and its camera sentence from the master camera's geometry. An
 * owner's pasted prompt is sent verbatim (owner decision 1: warned about, never rewritten). A Bible prompt naming an @tag no
 * element answers to throws UnknownTagError (the caller refuses, free). Pure.
 */
import { promptTags, untag, type BibleRecord } from '../../src/shared/bibleContract.ts'
import type { KitItem, ScenePlan } from '../../src/stage3d/contract.ts'
import { composeOrThrow } from '../bible/prompt.ts'
import { stripOpener } from '../prompt/sceneWords.ts'
import { sizeless } from '../prompt/sizeless.ts'
import { statedStyle } from '../prompt/style.ts'
import { unlabel } from '../prompt/unlabel.ts'
import { figureWords, type Figure } from './figures.ts'
import { lensFeelWords } from './kitView.ts'
import { plainNoun } from './kitWords.ts'
import { shortName } from './shortName.ts'
import { addOn, cardHead, cardRest, type DrawAdds } from './drawAdds.ts'
import { cutSentence, isNamed, ownerText, pluralNoun } from './pieceNames.ts'
import { personWords, placeOnly } from './placeWords.ts'
import { atmosphereOf, beatAt, briefElement, briefOf, heroAction, heroTagOf, lightOf, placeOf, styleOf, surfaceOf } from './stillBrief.ts'
import { pronounOf, samePerson } from './onePerson.ts'
import { asWritten, stillScene } from './stillWords.ts'

/** the master is the place with nobody in it (run 4: a person the depth has no body for was invented from the brief's sentence),
 *  said as what is there, never a negation (docs/prompting-review.md: a "no X" in Qwen's positive field primes X; prompt/warn.ts flags
 *  it); the people go in the master's negative prompt instead (qwenGraph.ts QWEN_NEG_PEOPLE) */
export const NOBODY = 'The place stands empty and quiet.'
/** at most this many pieces are named (plan order, so the planner's main pieces come first) */
const MAX_PIECES = 4

export interface StillPromptParts {
  bible: BibleRecord | null
  plan: Pick<ScenePlan, 'sentence' | 'kit'> & Partial<Pick<ScenePlan, 'light' | 'sky'>>
  cast: { cardId?: string | null; name: string; description: string }
  /** the camera at the still's frame (kitView.ts): what it sees (`pieces` when known), the short angle sentence; framing only at frame 0 */
  view?: { kinds: string[]; camera: string; framing?: string; angle?: string; pieces?: Pick<KitItem, 'kind' | 'pieceTag' | 'label'>[]
    /** visible pieces whose top the top edge cuts (kitView.ts cutAtTop): said, so the cut shape reads as that piece, never a new thing */
    cutTop?: Pick<KitItem, 'kind' | 'pieceTag' | 'label'>[] } | null
  /** each figure's place and size in the frame (figures.ts); null / absent = not known at this frame */
  figures?: Figure[] | null
  /** the motion word at this frame, e.g. "walking towards us" (stillAction.ts): the fallback when no beat or written action */
  action?: string
  /** `action` is the pose at this frame from an action that names its phases (stillAction.ts motionAt): it wins over beat and take */
  pose?: boolean
  /** the take's written action (TakeRecord.action), used when the brief has no beat for the hero */
  takeAction?: string
  /** performance time of the still's frame (s), to find the hero's beat */
  perfT?: number
  focal?: number
  override?: string
  /** 'master': the Bible's master (the place itself, no person); default 'still' */
  mode?: 'still' | 'master'
  /** the master's camera sentence, from its geometry (masterDraw.ts masterCameraWords) */
  masterCamera?: string
  /** (prompt-fix pass) the app's additions the press switched off (drawAdds.ts); absent = all on */
  adds?: DrawAdds
}

const strip = (s: string) => s.replace(/[.\s]+$/, '')
const sentence = (s: string) => (s ? `${s.charAt(0).toUpperCase()}${strip(s.slice(1))}.` : '')
const lowerFirst = (s: string) => s.replace(/^(A|An|The) /, (m) => m.toLowerCase())
/** pieces apart with semicolons (a label or board line may carry its own commas) */
const list = (xs: string[]) => xs.join('; ')
/** a place that already leads with a preposition takes none ("on a pier at night"); else "in" */
const PREPOSITION = /^(in|on|at|by|under|inside|beside|near|along|across|above|below|outside|through|among|amid|beneath|over|behind|within|around)\b/i
const inPlace = (place: string) => (PREPOSITION.test(place) ? place : `in ${lowerFirst(place)}`)

/** "A country road at dusk: rail fences along it, …" -> the place before its list of things (the no-brief fallback only) */
export const firstClause = (text: string): string => (text.split(/(?<=[.!?])\s+/)[0] ?? '').split(/\s*[:;—–]\s*|\s+-\s+/)[0].replace(/[.!?\s]+$/, '').trim()

/** the Bible board tile a set piece is: the element its pieceTag 'prop:<tag>' names, else a prop element tagged like its kind */
export function elementOf(bible: BibleRecord | null, k: Pick<KitItem, 'kind' | 'pieceTag'>) {
  const tag = k.pieceTag?.startsWith('prop:') ? k.pieceTag.slice(5) : k.kind
  return bible?.elements.find((e) => e.tag === tag && e.kind === 'prop') ?? null
}

type Piece = Pick<KitItem, 'kind' | 'pieceTag' | 'label'>

/** who is in the picture, and the scene words the still reads (stillWords.ts) */
function sceneOf(p: StillPromptParts) {
  const brief = briefOf(p.bible)
  const master = p.mode === 'master'
  // the hero is in the picture unless the figures say otherwise (null = not known: assume so); a master has nobody
  const hero = !master && (!p.figures || p.figures.some((f) => f.tag === 'hero'))
  const heroTag = heroTagOf(p.bible, p.cast.cardId, brief)
  const scene = stillScene({ bible: p.bible, brief, heroTag, inFrame: hero, cast: p.cast })
  return { brief, master, hero, heroTag, scene }
}

/**
 * The draw states a picture medium (a painting, an illustration …) in its scene words, the brief's style or the card; a pasted prompt
 * by its own words. The draw then has no photo lead, and the finish (kleinCard.ts buildCardPrompt `styled`) no photograph words.
 */
export function drawStyled(p: StillPromptParts): boolean {
  const pasted = p.override?.trim()
  if (pasted) return statedStyle(pasted)
  const { brief, scene } = sceneOf(p)
  return statedStyle(scene.words, brief?.style, p.cast.description)
}

/**
 * each visible piece once: its label, else its board tile's line, else its plain noun (plural when several of that kind are seen);
 * with the brief's materials; relief never, set dressing only when the owner's words give it (pieceNames.ts). Returns the words
 * and which pieces each one names, so the cut-at-the-top line can say the same words.
 */
function pieceWords(p: StillPromptParts): { words: string[]; of: Map<Piece, string> } {
  const brief = briefOf(p.bible)
  const pieces = (p.view ? p.view.pieces ?? p.view.kinds.map((kind) => ({ kind })) : p.plan.kit) as Piece[]
  const text = ownerText(p.bible, p.plan.sentence)
  const named = pieces.filter((k) => isNamed(k, !!elementOf(p.bible, k), text))
  const count = (kind: string) => named.filter((k) => k.kind === kind && !k.label && !elementOf(p.bible, k)).length
  const words: string[] = [], of = new Map<Piece, string>()
  for (const k of named) {
    const el = elementOf(p.bible, k)
    // F13: a label or board line may carry sizes ("1.2 m tall"); the clay already has them, the prompt names the thing only
    const noun = count(k.kind) > 1 ? pluralNoun(plainNoun(k.kind)) : plainNoun(k.kind)
    const tag = k.pieceTag?.startsWith('prop:') ? k.pieceTag.slice(5) : el?.tag
    // (prompt-fix pass) a label that is a raw tag ("car2") is said by its short name ("race car"), never as the tag
    const label = k.label?.trim() ? shortName({ label: k.label, tag, kind: k.kind, line: el?.line }) : ''
    const name = strip(sizeless(label)) || strip(sizeless(el?.line ?? '')) || noun
    const surface = el && !k.label ? '' : strip(surfaceOf(briefElement(brief, tag))) // a board line already says it
    const w = [lowerFirst(name), surface].filter(Boolean).join(', ')
    if (!words.includes(w)) words.push(w)
    of.set(k, w)
  }
  const kept = words.slice(0, MAX_PIECES)
  return { words: kept, of: new Map([...of].filter(([, w]) => kept.includes(w))) }
}

/** the Stage's own layout in words, all geometry: the figures and camera, the pieces in view, the cut top */
function layoutWords(p: StillPromptParts, hero: boolean, people: boolean) {
  const { words: set, of } = pieceWords(p)
  // the named pieces the top edge cuts: said as cut, so a dark mass at the edge (a canopy) is not drawn as a hat or a head (E146);
  // by the same words the list gives them, materials left off; a piece not named is not said to be cut either
  const key = (k: Piece) => `${k.kind}|${k.pieceTag ?? ''}|${k.label ?? ''}`
  const cutWords = (p.view?.cutTop ?? []).map((c) => of.get(c) ?? [...of].find(([k]) => key(k) === key(c))?.[1]).filter((w): w is string => !!w)
  return {
    camera: [...(p.figures ? figureWords(p.figures, '') : [p.view?.framing ?? '']), p.view?.angle ?? '', lensFeelWords(p.focal, people)],
    pieces: set.length ? sentence(`${hero ? 'Around them' : 'In the frame'}: ${list(set)}`) : '',
    cut: cutSentence([...new Set(cutWords.map((w) => w.split(',')[0]))]),
  }
}

/** a still's layout with the frame tail (pieces, cut top) left out when its switch is off (drawAdds.ts frameTail) */
function stillLayout(p: StillPromptParts, hero: boolean, people: boolean) {
  const l = layoutWords(p, hero, people)
  return addOn(p.adds, 'frameTail') ? l : { ...l, pieces: '', cut: '' }
}

/**
 * What the app adds to a still's draw words, each as it would be said with its switch on ('' = nothing to add here), so the press can
 * show it as "Added by the app" (drawAdds.ts): the cast card's later sentences while the hero is in the frame, and the frame tail.
 */
export function drawAdditions(p: StillPromptParts): Record<'castRest' | 'frameTail', string> {
  if (p.override?.trim() || p.mode === 'master') return { castRest: '', frameTail: '' }
  const { hero } = sceneOf(p)
  const people = !(p.figures && p.figures.length === 0)
  const l = layoutWords(p, hero, people)
  return { castRest: hero ? cardRest(p.cast.description) : '', frameTail: [l.pieces, l.cut].filter(Boolean).join(' ') }
}

/** The draw's prompt; throws UnknownTagError for an unknown @tag. */
export function buildDrawPrompt(p: StillPromptParts): string {
  const pasted = p.override?.trim()
  if (pasted) return pasted // owner decision 1: a pasted prompt goes verbatim; Shoot warns (prompt/warn.ts), never rewrites
  // (prompt-fix pass) the card's sentences after its first go only while "Added by the app" is on (drawAdds.ts castRest)
  if (!addOn(p.adds, 'castRest')) p = { ...p, cast: { ...p.cast, description: cardHead(p.cast.description) } }
  // every tag the scene names must answer to an element, also in sentences the still leaves out (M1: never drop the scene silently)
  composeOrThrow({ bible: p.bible, target: 'video', fallback: p.plan.sentence })
  const { brief, master, hero, heroTag, scene } = sceneOf(p)
  const styled = drawStyled(p)
  const people = !master && !(p.figures && p.figures.length === 0)
  const style = sentence(styleOf(brief))

  // (owner 10-29) the words go as written, each tag once by its card; then only the Stage's own layout, all shown before the press
  if (!master && scene.words) {
    const pose = hero && p.pose && p.action?.trim() ? pronounOf(p.cast.description) : null
    const l = stillLayout(p, hero, people)
    // a hero in the frame the words never tag is described once, by the card, so the clay's figure is that person (the render does
    // the same for a staged person the words do not name); a tagged hero already carries the card where the tag is
    const untagged = hero && !(heroTag && promptTags(p.bible?.prompt ?? '').includes(heroTag)) ? asWritten(stripOpener(p.cast.description.trim())) : ''
    return done([
      asWritten(scene.words),
      untagged,
      pose ? `${pose} ${pose === 'They' ? 'are' : 'is'} ${strip(p.action!.trim())}.` : '',
      ...l.camera, l.pieces, l.cut,
    ], style)
  }

  // the place names nobody (placeWords.ts): a brief setting that is the owner's whole first sentence carries its person and action
  const place = placeOnly(brief ? placeOf(brief) : fallbackPlace(p), personWords(p.bible))
  const light = brief ? lightOf(brief.light, people) : sentence(p.bible?.lighting?.trim() ?? '')
  const tail = [light, brief ? atmosphereOf(brief, people) : ''].filter(Boolean).map(sentence)
  // (owner 10-29) no photo words are added to a still: only the master, which no Stage press draws, keeps its lead
  const photo = styled || !master ? '' : 'Photo of '
  if (master) {
    const lead = !place ? `${photo}the place` : PREPOSITION.test(place) ? `${styled ? '' : 'Photo taken '}${lowerFirst(place)}` : `${photo}${lowerFirst(place)}`
    const l = layoutWords(p, false, false)
    return done([sentence(lead), NOBODY, p.masterCamera ?? '', lensFeelWords(p.focal, false), l.pieces, l.cut, ...tail], style)
  }
  const who = strip(stripOpener(p.cast.description.trim()) || p.cast.name)
  // a beat or written action naming the card's own person word is the same person, said by pronoun (onePerson.ts)
  const beat = beatAt(brief, heroTag, p.perfT ?? 0), same = (t: string) => samePerson(t, p.cast.description)
  const act = heroAction({ beat: beat && { ...beat, does: same(beat.does) }, takeAction: p.takeAction && same(p.takeAction), motion: p.action, pose: p.pose,
    name: briefElement(brief, heroTag)?.name || (brief ? p.cast.name : ''), elements: brief?.elements })
  const where = place ? (brief ? ` ${inPlace(place)}` : `, ${lowerFirst(place)}`) : ''
  const subject = hero && who ? `${photo}${lowerFirst(who)}${act.attach ? `${who.includes(',') ? ',' : ''} ${act.attach}` : ''}${where ? `${brief && act.attach ? ',' : ''}${where}` : ''}`
    : `${photo}${place ? lowerFirst(place) : 'the place'}`
  const l = stillLayout(p, hero, people)
  return done([sentence(subject), hero && act.after ? sentence(act.after) : '', ...l.camera, l.pieces, l.cut, ...tail], style)
}

/** no v2 brief: the scene prompt's first sentence that names no cast member, cut at its list, tags as plain words, without the Guided
 *  stepper's labels ("Set in …", "Cast: …"; F2: the render's own unlabel, so a pre-v2 Bible never sends a UI label to a paid draw) */
function fallbackPlace(p: StillPromptParts): string {
  const cast = new Set((p.bible?.elements ?? []).filter((e) => e.kind === 'cast').map((e) => e.tag))
  const src = unlabel(p.bible?.prompt.trim() ? p.bible.prompt : p.plan.sentence ?? '', p.mode !== 'master')
  const noCast = src.split(/(?<=[.!?])\s+/).filter((sen) => !promptTags(sen).some((t) => cast.has(t)))
  return firstClause(untag(noCast.join(' '), (t) => t.replace(/[_-]+/g, ' ')))
}

/** the parts joined, then the brief's `style` last */
function done(parts: string[], style = ''): string {
  const prompt = [...parts, style].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return prompt.endsWith('.') ? prompt : `${prompt}.`
}
