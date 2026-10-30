/**
 * "Same look as your earlier frame" (consistency pass, 2026-10-27; qa-2026-10-27-coverage REFERENCE-SCOPING (a) + (d)): an approved
 * first frame of ANOTHER take of the same world, drawn for the same cast card. A kit press that asks for it (`sameLook: true`, off by
 * default on the Stage; stage-only plan section 5) sends it as the finish's gear image (Klein's image 3: "exactly the clothes and gear
 * of image 3", kleinCard.ts), so a new angle wears what the approved one wore, and the Stage press sends its seed. Klein copies
 * whatever else is in that frame too, which is why it is a choice. "Draw from your approved frame" (kitRunEdit.ts) always uses it. Which frame (draw-from-master plan section 3): the scene's look pointer (lookPointer.ts) when it
 * points at a live frame, else the OLDEST approved first frame of the scene (the wide is approved first in every real walk; the
 * newest once picked a doubled-woman frame). A pointer that no longer holds falls back and `stale` says so. An approval of an older
 * start of its take does not count. Only the takes of this world are read, and only their hero folders. Read-only; null when none.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { HeroStill, TakeRecord } from '../../src/shared/shotContract.ts'
import { listTakes } from '../takes/store.ts'
import { readLookPointer } from './lookPointer.ts'
import { STILL_ID_RE } from './spec.ts'
import { heroDirOf, heroUrl } from './store.ts'

export interface SameLook {
  file: string; url: string; seed: number; takeId: string; stillId: string; createdAt: string
  /** how it was chosen: the owner's pointer, or the oldest approved first frame */
  source: 'pointer' | 'oldest'
  /** set only when a pointer exists but did not hold and the rule chose instead: the preview says so */
  stale?: string
}

export const STALE_LOOK_NOTE = 'The frame you picked as the scene\'s look is gone or no longer approved, so the first approved frame is used.'

const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }

/** the frame (take, still) as a look for `castId`, or null when it is not an approved opening of this cast at its take's start */
function lookOf(publicDir: string, t: Pick<TakeRecord, 'id' | 'startKey'>, stillId: string, castId: string): SameLook | null {
  const dir = heroDirOf(publicDir, t.id)
  const s = readJson<HeroStill & { role?: string }>(path.join(dir, `${stillId}.json`))
  if (!s?.approved || s.id !== stillId || s.takeId !== t.id || (s.role ?? 'opening') !== 'opening' || s.castId !== castId || s.startKey !== t.startKey) return null
  const file = path.join(dir, `${s.id}.png`)
  return existsSync(file) ? { file, url: heroUrl(t.id, `${s.id}.png`), seed: s.seed, takeId: t.id, stillId: s.id, createdAt: s.createdAt, source: 'oldest' } : null
}

type Pick2 = Pick<TakeRecord, 'id' | 'worldId'>

function pointed(publicDir: string, take: Pick2, castId: string): SameLook | null {
  const p = readLookPointer(publicDir, take.worldId)
  if (!p || p.takeId === take.id) return null
  const t = listTakes(publicDir).find((x) => x.id === p.takeId && x.worldId === take.worldId)
  const l = t ? lookOf(publicDir, t, p.stillId, castId) : null
  return l ? { ...l, source: 'pointer' } : null
}

function oldest(publicDir: string, take: Pick2, castId: string): SameLook | null {
  let best: SameLook | null = null
  for (const t of listTakes(publicDir)) {
    if (t.id === take.id || t.worldId !== take.worldId) continue
    let names: string[] = []
    try { names = readdirSync(heroDirOf(publicDir, t.id)) } catch { continue }
    for (const f of names) {
      const m = /^(hero-[\w-]+)\.json$/.exec(f)
      if (!m || !STILL_ID_RE.test(m[1])) continue
      const l = lookOf(publicDir, t, m[1], castId)
      if (l && (!best || l.createdAt < best.createdAt)) best = l
    }
  }
  return best
}

/** true when the world has a pointer that does not hold for this take and cast (so the preview can say it fell back) */
export function lookPointerStale(publicDir: string, take: Pick2, castId: string | null | undefined): boolean {
  if (!castId) return false
  const p = readLookPointer(publicDir, take.worldId)
  return !!p && p.takeId !== take.id && !pointed(publicDir, take, castId)
}

export function sameLookOf(publicDir: string, take: Pick2, castId: string | null | undefined): SameLook | null {
  if (!castId) return null
  const pick = pointed(publicDir, take, castId)
  if (pick) return pick
  const l = oldest(publicDir, take, castId)
  return l && lookPointerStale(publicDir, take, castId) ? { ...l, stale: STALE_LOOK_NOTE } : l
}
