/**
 * The Layout-To-Render prompt of a take whose scene has no words of its own (people and what they do, then the look), built from
 * the take's world (location meta.json `description`, else `prompt`; `lighting`) and its cast cards; positions are stripped from
 * the cast (E43). (owner 10-29) No camera line (the clay video carries the exact move), no "Match the first frame", no "Keep the
 * same … as the driver" and no "Photoreal.": the owner rejected each as a silent addition.
 * A kit world's take (Stage3D) reads its plan's `sentence` and the cast card Perform picked for the 3D performer instead.
 * Nothing the user, a card or the brief wrote is dropped (stage-only plan, section 5: the fire and grain clause-drop is gone; the
 * warnings on a pasted override still come from server/prompt/warn.ts). The closer is the brief's style when set, else nothing.
 * A take whose Bible carries the v2 brief and no scene words is written by buildBriefL2R (the card's shape, from the brief's fields);
 * one without keeps buildL2RPrompt, minus the Guided stepper's labels (unlabel) and the old "A cinematic shot" fallback.
 * The scene-words prompt (the live path) is stagedWords.ts.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { BriefLight } from '../../src/shared/briefContract.ts'
import { stripPositions, type OutfitCard } from '../prompt/outfit.ts'
import { ProjectStore } from '../project/store.ts'
import { lightingOf, performDir } from '../realism/cast.ts'
import { castFace } from '../hero/castCard.ts'
import { takeKitWorldFor } from '../stage3d/takeKitWorldFor.ts'
import { unlabel } from '../prompt/unlabel.ts'

/** spaces collapsed, no space before a stop, no stray punctuation at either end; never a word dropped */
export const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim().replace(/^[,;:\s]+|[,;:.\s]+$/g, '')

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const low = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s)
const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }

export { unlabel }

export interface PromptParts {
  place: string; cast: OutfitCard[]; lighting?: string
  /** what each of `cast` does, same order ("walks slowly towards the camera"): present = "At place, A does x, while B does y" */
  doing?: string[]
  /** the opening sentence(s) already composed from the scene (it names its own people); `cast` are then only the ones it did not name */
  lead?: string
  /** people are on the set though `cast` is empty (the lead names them) */
  people?: boolean
}

export const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

/** the last sentence: the brief's style when the brief has one (the user's own words); else nothing (owner 10-29: no "Photoreal.") */
export function closer(style: string | undefined): string {
  const s = (style ?? '').trim().replace(/[.\s]+$/, '')
  return s ? `${cap(s)}.` : ''
}

/**
 * A take with no v2 brief and no scene words: one or two sentences naming the people and what they do, then the world's light as its
 * own sentence. Only the people in `cast` are named: the caller passes the staged ones. Nothing known = no lead at all.
 */
export function buildL2RPrompt(p: PromptParts): string {
  const place = tidy(p.place).replace(/^(A|An|The)(?=\s)/, (m) => m.toLowerCase()) // it follows "…, at "
  const who = p.cast.map((c, i) => {
    const d = tidy(stripPositions(c.description)), doing = tidy(p.doing?.[i] ?? '')
    return d && doing ? `${d} ${doing}` : d
  }).filter(Boolean)
  // "at" reads right for any place ("at a muddy battlefield", "at a quiet street"); a place that brings its own preposition keeps it
  const where = /^(in|at|on|inside|under|near|by|beside|above|below|among|across|along|through)\s/i.test(place) ? place : `at ${place}`
  const acting = !!p.doing?.some(Boolean)
  const people = acting && who.length > 1 ? `${who[0]}, while ${list(who.slice(1))}` : acting ? who[0] ?? '' : list(who)
  // `lead`: the owner's own scene sentence (people already named in it); the `cast` left over follow it as a second sentence
  const lead = p.lead ? tidy(p.lead) : ''
  const scene = lead ? `${cap(lead)}${people ? `. ${cap(people)}` : ''}` : !people ? cap(place) : !place ? cap(people) : acting ? `${cap(where)}, ${people}` : `${cap(people)}, ${where}`
  const light = tidy((p.lighting ?? '').replace(/^\s*(\w+):\s*/, '$1, ')) // "Dusk: a deep blue sky" -> "dusk, a deep blue sky"
  return [scene && `${scene}.`, light && `${cap(light)}.`].filter(Boolean).join(' ')
}

const PREP = /^(from|behind|above|over|overhead|in front|to|at|on|through|under|below|beside|across|straight|into)\b/i

/** the brief's one key light in the rules' order (source, direction, height, quality, colour, effect), as short phrases */
export function lightWords(l: BriefLight | undefined): string {
  if (!l) return ''
  const key = (l.key ?? '').trim(), dir = (l.direction ?? '').trim()
  const has = (w: string) => new RegExp(`\\b${w}\\b`, 'i').test(`${key} ${dir}`)
  const from = !dir || PREP.test(dir) ? dir : `from ${dir}`
  const height = !l.height || has(l.height) ? '' : l.height === 'overhead' ? 'overhead' : `${l.height} in the sky`
  const quality = l.quality && !has(l.quality) ? `${l.quality} light` : ''
  return tidy([key, from, height, quality, l.colour, l.others, l.effect].map((x) => (x ?? '').trim()).filter(Boolean).join(', '))
}

export interface BriefPromptParts {
  /** the staged people, hero first: a short identifier and what they do over the take ('' = nothing said) */
  people: { who: string; doing: string }[]
  /** where it is: the brief's setting, whole */
  place: string
  /** the atmosphere in motion ("bees moving around her hands and the hive") */
  air: string
  /** the look: the light, then time / season / weather, then materials in short phrases */
  look: string
  /** the brief's style; '' = none */
  style: string
}

/**
 * A v2 brief with no scene words: "<People doing their beats>, <place>. <Air in motion>. <Look>. <Style>." Every part goes as the
 * brief wrote it (no word list drops a clause); nothing is added that the brief did not say.
 */
export function buildBriefL2R(p: BriefPromptParts): string {
  const who = p.people.map((x) => tidy(x.doing ? `${x.who} ${x.doing}` : x.who)).filter(Boolean)
  const people = p.people.some((x) => x.doing) && who.length > 1 ? `${who[0]}, while ${list(who.slice(1))}` : list(who)
  const place = low(tidy(p.place))
  const where = !place || /^(in|at|on|inside|under|near|by|beside|above|below|among|across|along|through|over)\s/i.test(place) ? place : `in ${place}`
  const first = cap(people ? (where ? `${people}, ${where}` : people) : place)
  const air = cap(tidy(p.air)), look = cap(tidy(p.look))
  return [first && `${first}.`, air && `${air}.`, look && `${look}.`, closer(p.style)].filter(Boolean).join(' ')
}

/** the world's words: description (else the generation prompt) and its lighting line */
export function worldWords(publicDir: string, worldId: string): { place: string; lighting?: string } {
  if (!/^[\w-]+$/.test(worldId)) return { place: '' }
  const m = readJson<{ description?: unknown; prompt?: unknown; result?: { shot?: { prompt?: unknown } } }>(path.join(publicDir, 'lab-assets', 'locations', worldId, 'meta.json'))
  const raw = [m?.description, m?.prompt, m?.result?.shot?.prompt].find((v): v is string => typeof v === 'string' && v.trim().length > 0) ?? ''
  const place = raw.replace(/\s*\((panorama|pano)\)\s*$/i, '').replace(/^(360 degree panorama[^,]*,\s*)?(a photograph taken standing in one place:\s*)?/i, '')
  return { place, lighting: lightingOf(publicDir, worldId) }
}

/** the cast of the perform session lifted into `packId` (place.json, in Place order), from the project documents; [] when unknown */
export async function castOf(publicDir: string, packId: string | null): Promise<OutfitCard[]> {
  const root = performDir(publicDir)
  if (!packId || !existsSync(root)) return []
  const sid = readdirSync(root).find((s) => /^perf-[\w-]{1,64}$/.test(s) && readJson<{ packId?: string }>(path.join(root, s, 'lift', 'lift.json'))?.packId === packId)
  const place = sid ? readJson<{ cast?: { cardId: string; version: number }[] }>(path.join(root, sid, 'place', 'place.json')) : null
  if (!place?.cast?.length) return []
  const store = new ProjectStore(publicDir)
  const docs = await Promise.all((await store.list()).map((p) => store.read(p.id).catch(() => null)))
  return place.cast.flatMap((c) => {
    for (const d of docs) {
      const v = d?.ingredients.cast.find((x) => x.id === c.cardId)?.versions.find((x) => x.version === c.version)
      if (v) return [{ name: v.payload.name, description: v.payload.description }]
    }
    return []
  })
}

export async function promptFor(publicDir: string, take: { worldId: string; packId: string | null }): Promise<string> {
  // a kit world (Stage3D): the place is its plan's sentence, the person the cast card that plays its 3D performer (no perform session)
  const kit = takeKitWorldFor(publicDir, take)
  if (kit) {
    const c = await castFace(publicDir, kit.perf.castId)
    // m13: no hard-coded creature sentence; a creature is named by its Bible tag, and Render warns when none is (status.ts)
    const place = unlabel(kit.plan.sentence?.trim() || kit.description)
    return buildL2RPrompt({ place, lighting: lightingOf(publicDir, kit.id), cast: c ? [{ name: c.name, description: c.description }] : [] })
  }
  const w = worldWords(publicDir, take.worldId)
  return buildL2RPrompt({ place: w.place, lighting: w.lighting, cast: await castOf(publicDir, take.packId) })
}
