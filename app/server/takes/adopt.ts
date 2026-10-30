/**
 * Adoption (PLAN-PER-TAKE-PERFORMANCE.md §2, PLAN-PER-TAKE-SET.md): a locked take with no copy of its own whose key is the scene's as
 * it stands gets a copy (perfFrom / setFrom 'adopted'), so changing the scene never takes a locked take's walk or set away. The kit
 * store calls these before every write of performance.json (savePerformance, setMark; resetToBuilt goes through savePerformance) and
 * of plan.json (changePlan: changeKit, movePiece, setMark, saveSky, saveGround, saveLight, resetToBuilt), and the takes list GET
 * calls them through takePerf.ts adoptScenePerf / takeSet.ts adoptSceneSet.
 *
 * Every write is a synchronous read-modify-write of that one take.json (no await between the read and the write), spreading the
 * record as read. A take that already has a copy is never written (whatever its copy is); a take with a null or non-mocap packId,
 * or another walk's packId, is never written; nor one with no setKey, another set's setKey, or frames made before the set last
 * changed. Imports nothing that reads a kit world (the kit store imports this).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { KitPerformance } from '../stage3d/types.ts'
import type { ScenePlan } from '../../src/stage3d/contract.ts'
import { mocapPackId } from '../../src/stage3d/planHash.ts'
import { setKeyOf } from '../../src/studio/shoot/setKey.ts'
import { shotPaths, type TakeRecord } from '../../src/shared/shotContract.ts'
import { listTakes, readTake, writeJson } from './takeFiles.ts'

/** the location id inside a take's worldId (stage3d/takeWorld.ts bareWorldId; repeated here, that module reads the kit store) */
const bare = (worldId: string) => worldId.replace(/^.*\//, '')

/** may this take adopt the walk whose pack id is `packId` on world `worldId`? */
const adoptable = (t: TakeRecord, worldId: string, packId: string) => !t.perf && t.packId === packId && bare(t.worldId) === bare(worldId)

/**
 * Copy `perf` (the world's performance.json as the kit store reads it) into every take of `worldId` that has no copy and whose
 * packId it hashes to. -> the ids of the takes adopted now. `takes`: the takes as already listed (the list GET lists once for every
 * world, fix 2026-10-30); only a pre-filter, since each candidate is read again from disk right before its write.
 */
export function adoptPerfInto(publicDir: string, worldId: string, perf: KitPerformance, takes: readonly TakeRecord[] = listTakes(publicDir)): string[] {
  const packId = mocapPackId(perf)
  const done: string[] = []
  for (const listed of takes) {
    if (!adoptable(listed, worldId, packId)) continue
    // read again right before the write: the record written is the one on disk now, spread whole
    const rec = readTake(publicDir, listed.id)
    if (!rec || !adoptable(rec, worldId, packId)) continue
    writeJson(path.join(publicDir, shotPaths(rec.id).take), { ...rec, perf, perfFrom: 'adopted' } satisfies TakeRecord)
    done.push(rec.id)
  }
  return done
}

/**
 * When the take's frames were made: its clay's start (clay/clay.json startedAt, else finishedAt) when that is later than the lock,
 * else the lock. A clay prepared again after a set change (clay/setRestamp.ts) is on the set as it stands, so its take is not behind.
 */
export function framesMadeAt(publicDir: string, t: Pick<TakeRecord, 'id' | 'lockedAt'>): number {
  const locked = Date.parse(t.lockedAt)
  let clay = NaN
  try {
    const c = JSON.parse(readFileSync(path.join(publicDir, shotPaths(t.id).clay, 'clay.json'), 'utf8')) as { startedAt?: string; finishedAt?: string }
    clay = Date.parse(c.startedAt ?? c.finishedAt ?? '')
  } catch { /* no clay yet: the lock is the date */ }
  return Number.isFinite(clay) && !(clay < locked) ? clay : locked
}

/** the take's frames were made before the set last changed (`setSince`, meta.json kit.setChangedAt): they may show another set */
export const framesBehind = (publicDir: string, t: Pick<TakeRecord, 'id' | 'lockedAt'>, setSince: string | null): boolean => {
  const changed = setSince ? Date.parse(setSince) : NaN
  return Number.isFinite(changed) && !(changed <= framesMadeAt(publicDir, t))
}

/** may this take adopt the set whose key is `key` on world `worldId`? (the frames check reads the disk, so it comes last) */
const setAdoptable = (pub: string, t: TakeRecord, worldId: string, key: string, since: string | null) =>
  !t.set && !!t.setKey && t.setKey === key && bare(t.worldId) === bare(worldId) && !framesBehind(pub, t, since)

/**
 * Copy `plan` (the world's plan.json as the kit store reads it) into every take of `worldId` that has no set copy, whose setKey it
 * hashes to and whose frames are not behind it. `setSince` = the world's kit.setChangedAt now, stamped on the copy. -> the ids adopted.
 * `takes`: as adoptPerfInto's (a pre-filter; each candidate is read again right before its write).
 */
export function adoptSetInto(publicDir: string, worldId: string, plan: ScenePlan, setSince: string | null, takes: readonly TakeRecord[] = listTakes(publicDir)): string[] {
  const key = setKeyOf(plan)
  if (!key) return []
  const done: string[] = []
  for (const listed of takes) {
    if (!setAdoptable(publicDir, listed, worldId, key, setSince)) continue
    const rec = readTake(publicDir, listed.id) // read again right before the write, spread whole
    if (!rec || !setAdoptable(publicDir, rec, worldId, key, setSince)) continue
    writeJson(path.join(publicDir, shotPaths(rec.id).take), { ...rec, set: plan, setFrom: 'adopted', setSince } satisfies TakeRecord)
    done.push(rec.id)
  }
  return done
}
