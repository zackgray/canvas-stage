/**
 * Locked takes on disk: public/<shotPaths(id).take> = take.json (a TakeRecord), one folder per take under SHOTS_DIR.
 * The server stamps the id, the startKey (the contract's function, the same one the page runs) and the dates. Re-locking an
 * identical take (every request field equal) returns the record already on disk; a changed one is a new take with a new id.
 */
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import { readBibleFile } from '../bible/read.ts'
import { KitStore } from '../stage3d/store.ts'
import { bareWorldId, isKitWorld } from '../stage3d/takeWorld.ts'
import { SHOTS_DIR, shotPaths, startKey, type TakeLockRequest, type TakePerfFields, type TakeRecord } from '../../src/shared/shotContract.ts'
import { takeWords } from '../../src/shared/takeWordsContract.ts'
import type { TakeSetFields } from '../../src/shared/takeSetContract.ts'
import { takeIdentity } from './request.ts'
import { listTakes, readTake, takeDir, writeJson } from './takeFiles.ts'
export { listTakes, readTake, takeDir, writeJson } from './takeFiles.ts'

const stamp = (d: Date) => d.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')

/** Lock a (parsed) take: the existing record when an identical one is on disk, else a new take.json. */
/** the world's current Bible version (null = no Bible), so a take records what its stills and render must match */
export function bibleVersionOf(publicDir: string, worldId: string): number | null {
  const id = worldId.replace(/^locations\//, '')
  if (!/^loc-[\w-]+$/.test(id)) return null
  const v = readBibleFile(publicDir, id)?.version
  return Number.isInteger(v) && (v as number) >= 1 ? (v as number) : null
}

/** `own`: the take's own performance, already checked against rq.packId (takePerf.ts lockPerf); null = the take keeps none.
 *  `ownSet`: the take's own set, already checked against rq.setKey (takeSet.ts lockSet); null = the take keeps none */
export function lockTake(publicDir: string, rq: TakeLockRequest, now = new Date(), wordsFrom?: string, own: Required<TakePerfFields> | null = null,
  ownSet: Required<TakeSetFields> | null = null): { take: TakeRecord; reused: boolean } {
  // the page may not know the Bible: the server records the world's current version when the request carries none
  const bv = rq.bibleVersion === undefined ? bibleVersionOf(publicDir, rq.worldId) : null
  const q: TakeLockRequest = bv !== null ? { ...rq, bibleVersion: bv } : rq
  const same = takeIdentity(q)
  // a frame-0 key that differs (a set piece moved, the camera and motion the same) is another take: its stills would show the old set
  // and so is a set key that differs (a piece built or moved), even where no frame-0 key was sent to say it
  const keyed = (a?: string, b?: string) => !a || !b || a === b
  // a key-less take (locked before set keys) is only the same take when its set has not changed since it was locked
  const keylessMoved = (t: TakeRecord) => !!q.setKey && !t.setKey && setChangedSince(publicDir, t)
  const existing = listTakes(publicDir).find((t) => takeIdentity(t) === same && keyed(t.frame0Key, q.frame0Key) && keyed(t.setKey, q.setKey) && !keylessMoved(t))
  if (existing) {
    // T3: a reused key-less take takes the request's keys, so the page and the next lock judge it by the set it was locked on
    // and a reused take with no performance of its own takes this one (same packId, so the same walk); a copy it has is never replaced;
    // the same for its set (same setKey, or a key-less take taking this one, so the same set)
    const keys = { ...(q.frame0Key && !existing.frame0Key ? { frame0Key: q.frame0Key } : {}), ...(q.setKey && !existing.setKey ? { setKey: q.setKey } : {}),
      ...(own && !existing.perf ? own : {}), ...(ownSet && !existing.set && (!existing.setKey || existing.setKey === q.setKey) ? ownSet : {}) }
    if (!Object.keys(keys).length) return { take: existing, reused: true }
    const take = { ...existing, ...keys }
    writeJson(path.join(publicDir, shotPaths(take.id).take), take)
    return { take, reused: true }
  }
  let id = `take-${stamp(now)}`
  for (let n = 2; readTake(publicDir, id) || existsDir(publicDir, id); n++) id = `take-${stamp(now)}-${n}`
  const at = now.toISOString()
  // the take's own words start as a COPY (takeWordsContract.ts TakeLockWords): of the take before it (the one the page names, else the
  // world's newest), else of the scene prompt now; a world with no Bible yet has none to copy
  const bible = readBibleFile(publicDir, q.worldId)
  const scene = bible?.prompt
  const named = wordsFrom ? readTake(publicDir, wordsFrom) : null
  const before = named?.worldId === q.worldId ? named : listTakes(publicDir).find((t) => t.worldId === q.worldId) ?? null
  const words = before && bible ? takeWords(before, bible) : scene
  const take: TakeRecord = {
    id, worldId: q.worldId, packId: q.packId, fps: 24, frames: q.frames, samples: q.samples, focal: q.focal, viewAspect: q.viewAspect,
    perfStart: q.perfStart, startKey: startKey(q.samples[0], q.focal, q.perfStart), lockedAt: at, createdAt: at,
    ...(q.timelineStart !== undefined ? { timelineStart: q.timelineStart } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.bibleVersion !== undefined ? { bibleVersion: q.bibleVersion } : {}),
    ...(q.frame0Key ? { frame0Key: q.frame0Key } : {}),
    ...(q.setKey ? { setKey: q.setKey } : {}),
    ...(own ? { perf: own.perf, perfFrom: own.perfFrom } : {}),
    ...(ownSet && q.setKey ? { set: ownSet.set, setFrom: ownSet.setFrom, setSince: ownSet.setSince } : {}),
    ...(typeof scene === 'string' ? { prompt: words ?? scene, sceneBase: scene } : {}),
  }
  writeJson(path.join(publicDir, shotPaths(id).take), take)
  return { take, reused: false }
}

/** the take's kit set had a piece built or moved after the take was locked (meta.json kit.setChangedAt); false off a kit world */
function setChangedSince(publicDir: string, t: TakeRecord): boolean {
  if (!isKitWorld(publicDir, t.worldId)) return false
  let changed: string | null = null
  try { changed = new KitStore(publicDir).setChangedAt(bareWorldId(t.worldId)) } catch { return false }
  return !!changed && Date.parse(changed) > Date.parse(t.lockedAt)
}

function existsDir(publicDir: string, id: string): boolean {
  try { return readdirSync(path.join(publicDir, SHOTS_DIR)).includes(id) } catch { return false }
}


/** where a discarded take's folder goes: under shots/ but not a take id, so nothing lists or looks it up (the paid files are kept) */
export const DISCARDED_DIR = '_discarded'

/** Take a locked take off the lists: its whole folder (clay, stills, renders) moves to shots/_discarded/. Null = no such take. */
export function discardTake(publicDir: string, id: string): { id: string; kept: string } | null {
  const dir = takeDir(publicDir, id)
  if (!dir || !readTake(publicDir, id)) return null
  const bin = path.join(path.resolve(publicDir, SHOTS_DIR), DISCARDED_DIR)
  mkdirSync(bin, { recursive: true })
  let to = path.join(bin, id)
  for (let n = 2; existsSync(to); n++) to = path.join(bin, `${id}-${n}`)
  renameSync(dir, to)
  return { id, kept: `${SHOTS_DIR}/${DISCARDED_DIR}/${path.basename(to)}` }
}
