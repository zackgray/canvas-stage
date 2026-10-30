/**
 * A kit take's default Render prompt (recipe step 5), the STAGED cast only. Three cases:
 * - the scene has words (the Bible's `prompt`, the drawer's text): they go as written, each tag once by its card (stagedWords.ts
 *   fromWords; owner 10-29);
 * - no words and the Bible carries the v2 brief (briefContract.ts): prompt.ts buildBriefL2R from its fields — the staged people by
 *   their who-phrase (the card's first whole sentence) doing their beats in order (one per 2–3 s of the take), the setting, the
 *   atmosphere in motion, the look from `brief.light` and the visible elements' materials in short phrases, the brief's style;
 * - no words and no brief: prompt.ts buildL2RPrompt — the plan's sentence and the staged people from their cards, then the
 *   lighting, materials and far background.
 * No camera line, keep line or "Photoreal." in any case (owner 10-29). Nothing the user, a card or the brief wrote is dropped.
 * Pure given what the caller read; the caller owns the files (compose.ts defaultPrompt).
 */
import { promptTags, type BibleRecord } from '../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../src/shared/briefContract.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { lightingLine, materialsLine, backgroundLine, unknownTagMessage } from '../bible/prompt.ts'
import type { KitWorld } from '../stage3d/types.ts'
import { buildBriefL2R, buildL2RPrompt, lightWords, unlabel } from './prompt.ts'
import { stagedCast, type Staged } from './stagedPrompt.ts'
import { whoPhrase } from '../prompt/sceneWords.ts'
import { creatureWords, fromWords } from './stagedWords.ts'
import { httpError } from './spec.ts'
import { tagWords } from '../../src/shared/tagWords.ts'

export { creatureWords }

export interface StagedInput {
  take: TakeRecord
  kit: KitWorld
  bible: BibleRecord | null
  /** the hero's Cast card (castFace) */
  hero: { cardId: string; description: string; name?: string } | null
  /** every Cast card description the Bible's elements point at (compose.ts castDescriptions) */
  descriptions: Record<string, string>
  /** the world's own lighting line, when the Bible has none */
  worldLighting?: string
}

/** the v2 brief on a Bible, when it has one with the fields the writer reads (track B1 stores it; older Bibles have none) */
export function briefOf(bible: BibleRecord | null): SceneBriefV2 | null {
  const b = bible?.brief
  return b && typeof b === 'object' && b.light && typeof b.light === 'object' && Array.isArray(b.beats) && Array.isArray(b.elements) && b.place ? b : null
}

export function stagedDefault(i: StagedInput): string {
  const { take, bible } = i
  const known = new Set((bible?.elements ?? []).map((e) => e.tag))
  const written = [...new Set([...promptTags(bible?.prompt ?? ''), ...promptTags(take.action ?? '')])]
  // M1 backstop: an unknown tag is refused whatever was dropped (readiness gates the button)
  const unknown = written.filter((t) => !known.has(t))
  if (unknown.length) throw httpError(409, `${unknownTagMessage(unknown)} Fix it in the Stage's words, or write a prompt override.`, 'unknown_tag')
  const brief = briefOf(bible)
  if (bible?.prompt.trim()) return fromWords({ bible, brief, staged: castOf(i, brief), hero: i.hero, action: take.action ?? '', creatures: i.kit.perf.creatures })
  return brief ? fromBrief(i, brief) : fromScene(i)
}

/** an element's name as a bare noun: "The beekeeper" -> "beekeeper" (the prompt adds its own article) */
const noun = (n: string | undefined) => (n ?? '').trim().replace(/^(the|a|an)\s+/i, '').toLowerCase()

/** brief text with each @tag read as its element's name ("lifts @honeycomb_frame" -> "lifts the honeycomb frame"): the gate's own
 *  tagWords (F3), so a row typed after the brief was saved reads the same as one Develop wrote */
export function briefWords(b: SceneBriefV2): (s: string) => string {
  return (s: string) => tagWords(s ?? '', b.elements).trim()
}

const tagOf = (who: string) => who.trim().replace(/^@/, '')
/** the first phrase of a materials / condition line, short */
const phrase = (s: string, words = 10) => s.split(/[.;:]/)[0].trim().split(/\s+/).slice(0, words).join(' ').replace(/,$/, '')

/** each person's beats in order, as many as the take's length holds (one main action per 2–3 s): tag -> "does x, then y" */
function briefBeats(take: TakeRecord, b: SceneBriefV2): Record<string, string> {
  const words = briefWords(b)
  const seconds = take.frames / (take.fps || 24), most = Math.max(1, Math.floor(seconds / 2))
  const beats: Record<string, string> = {}
  for (const tag of new Set(b.beats.map((x) => tagOf(x.who)))) {
    const own = b.beats.filter((x) => tagOf(x.who) === tag && x.does?.trim())
    let t = 0
    const kept = own.filter((x, k) => { const ok = k < most && (k === 0 || t < seconds); t += x.seconds || 2; return ok })
    if (kept.length) beats[tag] = kept.map((x) => words(x.does).replace(/[.!?]+$/, '')).join(', then ')
  }
  return beats
}

/** the staged people, hero first; with a brief each does their beats (else the take's action, as before) */
const castOf = (i: StagedInput, b: SceneBriefV2 | null): Staged[] => stagedCast({ heroCardId: i.hero?.cardId, heroDescription: i.hero?.description,
  heroNames: i.hero?.name ? [i.hero.name] : [], action: b ? briefWords(b)(i.take.action ?? '') : i.take.action, extras: i.kit.perf.extras,
  bible: i.bible, descriptions: i.descriptions, ...(b ? { beats: briefBeats(i.take, b) } : {}) })

function fromBrief(i: StagedInput, b: SceneBriefV2): string {
  const { take } = i
  const words = briefWords(b)
  const staged = castOf(i, b)
  const here = new Set(staged.flatMap((s) => (s.tag ? [s.tag] : [])))
  const air = b.atmosphere.filter((a) => a.what?.trim()).slice(0, 2)
    .map((a) => { const w = words(a.what), at = words(a.where ?? ''); return /\b\w+ing\b/.test(w) || /^\w+ing\b/.test(at) ? `${w} ${at}`.trim() : at ? `${w} moving ${at}` : `${w} in the air` })
  // visible elements: the props, and the people who are on the set; their materials, short, each naming what it dresses ("the hive in …")
  const shown = b.elements.filter((e) => (e.type === 'prop' || (e.type === 'person' && here.has(e.tag))) && (e.materials ?? '').trim())
  // F4: the Match line is the card's own fixed line, kept to short phrases: the light, one time word, two materials
  const mats = shown.slice(0, 2).map((e) => `the ${noun(e.name)} in ${phrase(words(e.materials), 6)}${e.condition?.trim() ? `, ${phrase(words(e.condition), 4)}` : ''}`)
  const light = lightWords(b.light), lowLight = light.toLowerCase()
  const when = [b.place.time, b.place.season, b.place.weather].map((x) => (x ?? '').trim()).filter((x) => x && !lowLight.includes(x.toLowerCase()))
  return buildBriefL2R({
    people: staged.map((s) => ({ who: whoPhrase({ description: s.description }), doing: s.doing })),
    place: words(unlabel(b.place.setting ?? '')),
    air: [...air, creatureWords(i.kit.perf.creatures, `${b.place.setting ?? ''} ${b.beats.map((x) => x.does).join(' ')} ${take.action ?? ''}`)].filter(Boolean).join(', '),
    look: [light, when[0] ?? '', ...mats].filter(Boolean).join('; '),
    style: b.style ?? '',
  })
}

/** no words and no brief: the plan's sentence, the staged people from their cards, the Bible's lines as the look */
function fromScene(i: StagedInput): string {
  const { kit, bible } = i
  const staged = castOf(i, null)
  const place = unlabel(kit.plan.sentence?.trim() || kit.description)
  const lighting = [lightingLine(bible) || i.worldLighting || '', materialsLine(bible), backgroundLine(bible)].filter(Boolean).join(' ')
  const beast = creatureWords(kit.perf.creatures, i.take.action ?? '')
  return buildL2RPrompt({ place: beast ? `${place}, ${beast}` : place, cast: staged.map((s) => ({ name: s.tag ?? 'hero', description: s.description })),
    doing: staged.map((s) => s.doing), lighting })
}
