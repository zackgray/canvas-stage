/**
 * What a Layout-To-Render pass is built from, read from disk (docs/wave-b-contract.md): T1's take.json (TakeRecord) and
 * clay/clay.json (ClayExport) + clay.mp4, T2's approved hero still (hero/<stillId>.json + .png). `readiness` says what is
 * there and what is missing, with where to get it; `requireInputs` turns the first missing thing into a refusal. Free.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { stillHardWhy, WORDS_CHANGED, WORDS_CHANGED_WHERE, wordsOnlyBehind } from '../../src/shared/wordsOnFrame.ts'
import { isStale, type ClayExport, type HeroStill, type L2RMissing, type TakeRecord } from '../../src/shared/shotContract.ts'
import { composePrompt } from '../bible/prompt.ts'
import { takeBible } from '../takes/words.ts'
import { castStale } from '../../src/shared/startKey.ts'
import { setMovedFor, type SetJudgeTake } from '../takes/setJudge.ts'
import { takeKitWorldFor } from '../stage3d/takeKitWorldFor.ts'
import { claySetStampStale, clayStampStale, PACK_STAMP_STALE, SET_STAMP_STALE } from '../clay/stamps.ts'
import { httpError, is8k1, shotDirs, STILL_RE } from './spec.ts'

const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }

const STAGE_CLAY = 'On the Stage, press Draw the first frame: it prepares the frames first (free, on this machine), then draws.'
/** where a set change after the frames points: the same take, its frames made again from the set as it stands, no new recording */
export const SET_MOVED_WHERE = 'On the Stage, press Draw the first frame on this take: it prepares the frames again from the set as it stands (free, the same take and camera move), then draws a first frame of the new set.'
export const STILL_SET_WHY = 'it was drawn before the set changed (a piece was built or moved)'
export const STILL_OTHER_SET = 'it was drawn on another set than the frames prepared for this take'
const STAGE_STILL = 'Draw a first frame on the Stage and pick a version.'

export interface Readiness {
  take: TakeRecord | null
  clay: ClayExport | null
  still: HeroStill | null
  missing: L2RMissing[]
  clayFile: string | null
  stillFile: string | null
}

/** the take's approved opening still (the newest, if several were ever approved), stale or not; mid / end keyframe stills are not it (keyframes.ts) */
export function approvedStill(heroDir: string, takeId: string): HeroStill | null {
  if (!existsSync(heroDir)) return null
  const stills = readdirSync(heroDir).filter((f) => f.endsWith('.json')).map((f) => readJson<HeroStill>(path.join(heroDir, f)))
    .filter((s): s is HeroStill => !!s && typeof s.id === 'string' && STILL_RE.test(s.id) && s.takeId === takeId && s.approved === true && (s.role === undefined || s.role === 'opening'))
  return stills.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

export function readiness(publicDir: string, takeId: string): Readiness {
  const d = shotDirs(publicDir, takeId)
  const take = readJson<TakeRecord>(d.take)
  const out: Readiness = { take: null, clay: null, still: null, missing: [], clayFile: null, stillFile: null }
  if (!take || take.id !== takeId) {
    out.missing.push({ code: 'no_take', message: 'This take is not locked on disk.', where: 'Lock the take on the Stage.' })
    return out
  }
  out.take = take
  // T1's clay.json also holds the child's pid and log lines while it runs: internal, never answered (T1's own GET strips them too)
  const stored = readJson<ClayExport & { pid?: unknown; log?: unknown }>(path.join(d.clay, 'clay.json'))
  const clay: ClayExport | null = stored ? (({ pid: _pid, log: _log, ...c }) => c)(stored) : null
  const clayFile = path.join(d.clay, 'clay.mp4')
  out.clay = clay
  if (!clay || !existsSync(clayFile)) out.missing.push({ code: 'no_clay', message: "This take's frames are not prepared yet.", where: STAGE_CLAY })
  else if (clay.status !== 'done') out.missing.push({ code: 'clay_not_done', message: `The clay export is ${clay.status}${clay.error ? `: ${clay.error}` : ''}.`, where: STAGE_CLAY })
  else if (clay.takeId !== take.id || clay.startKey !== take.startKey) out.missing.push({ code: 'clay_stale', message: 'The clay was exported from an earlier version of this take.', where: STAGE_CLAY })
  // frames stamped with another walk than the take's (clay/stamps.ts): a render would follow that walk, not the take's
  // (per-take set) frames stamped with another set than the take's: a render would lay out that set
  else if (clayStampStale(take, clay)) out.missing.push({ code: 'clay_stale', message: claySetStampStale(take, clay) ? SET_STAMP_STALE : PACK_STAMP_STALE, where: STAGE_CLAY })
  else if (clay.frames !== take.frames || !is8k1(take.frames)) out.missing.push({ code: 'clay_frames',
    message: `The clay has ${clay.frames} frames and the take ${take.frames}: they must match and be 8k+1 (a clip longer than the take fails on Cloud after billing).`, where: STAGE_CLAY })
  // a piece built or moved after the frames were made: the render would follow the old set (the take's key does not see the set)
  else if (claySetMoved(publicDir, take, clay)) out.missing.push({ code: 'clay_set_moved',
    message: 'The set has changed since these frames were prepared (a piece was built or moved): a render now would show the set as it was.',
    where: SET_MOVED_WHERE })
  else out.clayFile = clayFile

  const bible = takeBible(publicDir, take) // the take's own words stand as the prompt (takes/words.ts)
  const still = approvedStill(d.hero, take.id)
  out.still = still
  const stillFile = still ? path.join(d.hero, `${still.id}.png`) : null
  if (!still || !stillFile || !existsSync(stillFile)) out.missing.push({ code: 'no_still', message: 'This take has no approved hero still.', where: STAGE_STILL })
  else if (isStale(still, take)) out.missing.push({ code: 'stale_still', message: 'The approved still shows an older opening of this take (its camera, lens or performance frame changed).', where: 'Draw a new first frame on the Stage.' })
  else if (castMoved(publicDir, still, take)) out.missing.push({ code: 'stale_still', message: 'The approved still shows another character: the take has since been cast with someone else.', where: 'Draw a new first frame on the Stage, or pick the character back in the subject panel on the Stage.' })
  // drawn on the set as it stood before a piece was built or moved: its frame would disagree with the frames made from the set now
  else if (stillSetMoved(publicDir, take, still)) out.missing.push({ code: 'stale_still', message: `The approved still is out of date: ${STILL_SET_WHY}.`, where: 'Draw a new first frame on the Stage.' })
  // (per-take set) the still and the frames each say which set they were made on, and they differ
  else if (stillClaySetDiffer(still, clay)) out.missing.push({ code: 'stale_still', message: `The approved still is out of date: ${STILL_OTHER_SET}.`, where: 'Draw a new first frame on the Stage.' })
  // M3 (plan §3.1): the opening still is the look; one drawn against an older Bible would disagree with the grade and every keyframe
  else if (stillHardWhy(still, bible)) out.missing.push({ code: 'stale_still', message: `The approved still is out of date: ${stillHardWhy(still, bible)}.`, where: 'Draw a new first frame on the Stage.' })
  else {
    // only the take's words moved: the frame stays valid, and Render asks which way (wordsOnFrame.ts); a press must say which
    if (wordsOnlyBehind(still, bible)) out.missing.push({ code: 'words_changed', message: WORDS_CHANGED, where: WORDS_CHANGED_WHERE })
    out.stillFile = stillFile
  }
  // M1: the default prompt names a tag no reference answers to; a render would drop the scene. An override does not read it.
  const c = composePrompt({ bible, target: 'video', fallback: '', action: take.action })
  if (c.unknown.length) out.missing.push({ code: 'unknown_tag', message: `The scene prompt names ${c.unknown.map((t) => `@${t}`).join(', ')}, which no reference tile answers to.`, where: "Add the tile or take the tag out of the Stage's words, or write a prompt override here." })
  return out
}

/** a kit take's still made for one cast card while the world's performance now names another (stills made before castId was recorded pass) */
export function castMoved(publicDir: string, still: HeroStill, take: TakeRecord): boolean {
  if (still.castId === undefined) return false
  const kit = takeKitWorldFor(publicDir, take)
  return !!kit && castStale(still, kit.perf.castId)
}

/**
 * The take's clay was made on another set than the take's (takes/setJudge.ts): its set stamp is not the take's key, or a take with its
 * own set had it made before that copy's setSince, or a take with no copy had its world's set change after it (kit.setChangedAt). The
 * clay, and so the render's layout, would show another set. Null when it is on the take's set, or there is no date to judge by.
 */
export function claySetMoved(publicDir: string, take: SetJudgeTake, clay: Pick<ClayExport, 'setKey' | 'startedAt' | 'finishedAt'>): string | null {
  return setMovedFor(publicDir, take, { setKey: clay.setKey, at: clay.startedAt ?? clay.finishedAt })
}

/** a still drawn on another set than the take's (the same rule, by its setKey stamp, else its createdAt). Null when not. */
export function stillSetMoved(publicDir: string, take: SetJudgeTake, still: Pick<HeroStill, 'createdAt' | 'setKey'>): string | null {
  return setMovedFor(publicDir, take, { setKey: still.setKey, at: still.createdAt })
}

/** a still and the clay both stamped, with different sets: the render would lay one set's frames under another set's picture */
export const stillClaySetDiffer = (still: Pick<HeroStill, 'setKey'>, clay: Pick<ClayExport, 'setKey'> | null): boolean =>
  !!clay && still.setKey !== undefined && clay.setKey !== undefined && still.setKey !== clay.setKey

export interface Inputs { take: TakeRecord; clay: ClayExport; still: HeroStill; clayFile: string; stillFile: string
  /** the render goes with words the first frame was not drawn from (the owner chose it: `wordsOnFrame`) */
  wordsDiffer: boolean }

/** the inputs, or the first refusal: 404 no take, 409 anything else missing or stale, 409 a still that is not the approved one.
 *  `override`: the owner's own prompt goes, so the scene prompt's unknown tag does not stop it (its own tags are checked when sent).
 *  `wordsOnFrame`: the owner chose to render the take's words now on a frame drawn from earlier ones; without it that is a 409
 *  `words_changed`. Every other stale reason refuses either way. */
export function requireInputs(publicDir: string, takeId: string, stillId: string, o: { override?: boolean; wordsOnFrame?: boolean } = {}): Inputs {
  const r = readiness(publicDir, takeId)
  const first = r.missing.find((m) => !(o.override && m.code === 'unknown_tag') && !(o.wordsOnFrame && m.code === 'words_changed'))
  if (first) throw Object.assign(httpError(first.code === 'no_take' ? 404 : 409, `${first.message} ${first.where}`), { code: first.code })
  if (r.still!.id !== stillId) throw Object.assign(httpError(409, `Still ${stillId} is not this take's approved still (${r.still!.id}). ${STAGE_STILL}`), { code: 'not_approved' })
  return { take: r.take!, clay: r.clay!, still: r.still!, clayFile: r.clayFile!, stillFile: r.stillFile!, wordsDiffer: r.missing.some((m) => m.code === 'words_changed') }
}
