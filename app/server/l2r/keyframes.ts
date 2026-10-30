/**
 * Mid / end keyframe stills for a Layout-To-Render pass. Shoot (track B) approves them into the take's hero folder with a
 * `role` ('mid' | 'end') and the clay `frame` they were drawn on; Render sends the ones the owner switches on as extra guides.
 * The frame maths is a copy of experiments/tune/keyframes.ts (LTX latents are 8 pixel frames: indices snap to the 8-grid, a
 * mid / end sits between 8 and the last frame). A keyframe is refused, free and before any spend, when it is not this take's,
 * not approved, drawn for an older opening of the take (startKey), against an older Bible, or for a cast who has since moved.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import { stillBibleWhy } from '../../src/shared/stillBible.ts'
import { isStale, snapFrame, type HeroStill, type TakeRecord } from '../../src/shared/shotContract.ts'
import { KEY_STRENGTH } from '../../src/shared/keyframeContract.ts'
import type { KeyframeChoice, KeyName } from '../../src/studio/render/l2rExtra.ts'
import { readBibleFile } from '../bible/read.ts'
import { checkLayout } from '../hero/layoutCheck.ts'
import { castMoved } from './inputs.ts'
import { httpError, shotDirs, STILL_RE } from './spec.ts'

const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }

export { snapFrame }
export const lastFrame = (frames: number): number => frames - 1

/** the scene Bible of a take's world, null when there is none (server/bible owns the store and its one reader) */
export const bibleOf = readBibleFile

/** why a keyframe still cannot be sent, or null; the first reason wins */
export function whyStale(publicDir: string, still: HeroStill, take: TakeRecord, bible: BibleRecord | null): string | null {
  if (still.takeId !== take.id) return `That still belongs to another take (${still.takeId}).`
  if (isStale(still, take)) return 'It was drawn for an older opening of this take (its camera, lens or performance frame changed).'
  const behind = stillBibleWhy(still, bible)
  if (behind) return `${behind}.`
  if (castMoved(publicDir, still, take)) return 'It shows another character: the performance has since picked someone else to play the 3D performer.'
  const f = still.frame ?? -1
  if (f < 8 || f > lastFrame(take.frames) || f !== snapFrame(f)) return `Its frame ${f} is outside this take (8 to ${lastFrame(take.frames)}, on the 8-frame grid).`
  return null
}

/** every approved mid / end keyframe still of the take, newest first */
function allKeyframes(heroDir: string, takeId: string): HeroStill[] {
  if (!existsSync(heroDir)) return []
  return readdirSync(heroDir).filter((f) => f.endsWith('.json')).map((f) => readJson<HeroStill>(path.join(heroDir, f)))
    .filter((s): s is HeroStill => !!s && typeof s.id === 'string' && STILL_RE.test(s.id) && s.takeId === takeId && s.approved === true && (s.role === 'mid' || s.role === 'end'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * E140 A: keyframes drawn on their own morph the set. Does this keyframe still follow the clay at its frame (the same free check the
 * hero still uses, hero/layoutCheck.ts, read-only)? A sentence when it does not, null when it does or the clay's depth for that frame
 * is not there to say. Only the Render screen shows it: a keyframe that disagrees pulls the second half of the take off the opening's set.
 */
export function setDiffers(publicDir: string, still: HeroStill, take: TakeRecord): string | null {
  const f = still.frame ?? -1
  if (f < 0) return null
  const check = checkLayout(path.join(shotDirs(publicDir, take.id).clay, `zdepth_${String(f).padStart(3, '0')}.png`), path.join(shotDirs(publicDir, take.id).hero, `${still.id}.png`))
  return check && !check.ok ? `This keyframe's set differs from the opening: its shapes do not follow the 3D set at frame ${f} (layout ${check.score.toFixed(2)}), so sending it can morph the set.` : null
}

/** the newest approved mid and end still, each with its staleness (what the Render screen offers) */
export function keyframeChoices(publicDir: string, take: TakeRecord, bible: BibleRecord | null): { mid: KeyframeChoice | null; end: KeyframeChoice | null } {
  const all = allKeyframes(shotDirs(publicDir, take.id).hero, take.id)
  const of = (name: KeyName): KeyframeChoice | null => {
    const still = all.find((s) => s.role === name)
    return still ? { still, role: name, frame: still.frame ?? 0, strength: KEY_STRENGTH[name], stale: whyStale(publicDir, still, take, bible), setDiffers: setDiffers(publicDir, still, take) } : null
  }
  return { mid: of('mid'), end: of('end') }
}

export interface ResolvedKey { name: KeyName; still: HeroStill; file: string; frame: number; strength: number }

/** the requested mid / end stills, or the first refusal (409 `no_keyframe` / `stale_keyframe`, 400 for a bad pair) */
export function requireKeyframes(publicDir: string, take: TakeRecord, bible: BibleRecord | null, want: { mid?: string; end?: string }): ResolvedKey[] {
  const dir = shotDirs(publicDir, take.id).hero
  const out: ResolvedKey[] = []
  for (const name of ['mid', 'end'] as const) {
    const id = want[name]
    if (!id) continue
    if (!STILL_RE.test(id)) throw httpError(400, `${name} still id is not valid`, 'bad_request')
    const still = readJson<HeroStill>(path.join(dir, `${id}.json`))
    const file = path.join(dir, `${id}.png`)
    if (!still || still.id !== id || !existsSync(file)) throw httpError(409, `The ${name} keyframe ${id} is not in this take's stills. Approve one on the Stage.`, 'no_keyframe')
    if (still.role !== name || still.approved !== true) throw httpError(409, `${id} is not this take's approved ${name} keyframe. Approve one on the Stage.`, 'no_keyframe')
    const why = whyStale(publicDir, still, take, bible)
    if (why) throw httpError(409, `The ${name} keyframe is stale: ${why} Draw and approve a new one on the Stage.`, 'stale_keyframe')
    out.push({ name, still, file, frame: still.frame!, strength: KEY_STRENGTH[name] })
  }
  const [mid, end] = [out.find((k) => k.name === 'mid'), out.find((k) => k.name === 'end')]
  if (mid && end && mid.frame >= end.frame) throw httpError(409, `The mid keyframe (frame ${mid.frame}) has to come before the end keyframe (frame ${end.frame}).`, 'stale_keyframe')
  return out
}
