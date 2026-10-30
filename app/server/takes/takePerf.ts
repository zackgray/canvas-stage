/**
 * A take's own performance (PLAN-PER-TAKE-PERFORMANCE.md §2; the rule is in src/shared/takePerfContract.ts): what it is
 * (takePerfOf), the copy Lock take stores (lockPerf), and adoption of the scene's walk into the takes locked on it (adoptScenePerf,
 * adoptAllTakes; the write itself is adopt.ts). Free, local.
 */
import { mocapPackId } from '../../src/stage3d/planHash.ts'
import {
  isMocapPackId, PERF_MISMATCH, PERF_NOT_MOCAP, perfMatchesPack, withSceneCast,
  type TakeLockRequest, type TakePerfFields, type TakePerfState, type TakeRecord,
} from '../../src/shared/shotContract.ts'
import { parsePerformancePlan } from '../stage3d/perf.ts'
import { bareWorldId, takeKitWorld } from '../stage3d/takeWorld.ts'
import type { KitPerformance, KitWorld } from '../stage3d/types.ts'
import { adoptPerfInto } from './adopt.ts'
import { listTakes } from './takeFiles.ts'

export interface TakePerf {
  state: TakePerfState
  /** the performance the take plays, with the scene's castId laid over (withSceneCast): null for 'unmatched' and 'none' */
  perf: KitPerformance | null
}

/**
 * What the take plays. `world` = the take's scene (takeKitWorld), whose castId is laid over the copy and whose walk stands in for a
 * take with no copy while it still hashes to the packId (state 'adopted': the next adoption writes that copy). A copy that does not
 * hash to the packId is 'unmatched', never silently matched; so is a mocap take with no copy and a scene that walks another walk.
 */
export function takePerfOf(take: Pick<TakeRecord, 'packId' | 'perf' | 'perfFrom'>, world: Pick<KitWorld, 'perf'> | null): TakePerf {
  if (!isMocapPackId(take.packId)) return { state: 'none', perf: null }
  if (take.perf) {
    if (!perfMatchesPack(take.perf, take.packId)) return { state: 'unmatched', perf: null }
    return { state: take.perfFrom === 'adopted' ? 'adopted' : 'own', perf: withSceneCast(take.perf, world?.perf) }
  }
  if (world && perfMatchesPack(world.perf, take.packId)) return { state: 'adopted', perf: world.perf }
  return { state: 'unmatched', perf: null }
}

/** copy the scene's performance.json into every take of `worldId` locked on it that has no copy yet -> the ids adopted now */
export function adoptScenePerf(publicDir: string, worldId: string, takes?: readonly TakeRecord[]): string[] {
  const world = takeKitWorld(publicDir, worldId)
  return world ? adoptPerfInto(publicDir, worldId, world.perf, takes) : []
}

/** (the takes list GET) adoption for every world that has a mocap take without a copy -> the ids adopted now. `takes`: the list
 *  read once for every world (fix 2026-10-30: it was read again per world) */
export function adoptAllTakes(publicDir: string, takes: readonly TakeRecord[] = listTakes(publicDir)): string[] {
  const worlds = new Set(takes.filter((t) => !t.perf && isMocapPackId(t.packId)).map((t) => bareWorldId(t.worldId)))
  return [...worlds].flatMap((id) => adoptScenePerf(publicDir, id, takes))
}

export type LockPerf = { ok: true; own: Required<TakePerfFields> | null } | { ok: false; status: number; error: string }

/**
 * The copy a lock stores. `sent` = the request's `perf` (TakeLockPerf): parsed as the kit store parses performance.json, then it
 * must hash to the request's packId (409 otherwise; the take is not locked). Nothing sent (an older page): the scene's file when it
 * hashes to the packId, else no copy, as before this existed. A take with no 3D performer keeps none.
 */
export function lockPerf(publicDir: string, q: Pick<TakeLockRequest, 'worldId' | 'packId'>, sent: unknown): LockPerf {
  if (sent === undefined || sent === null) {
    if (!isMocapPackId(q.packId)) return { ok: true, own: null }
    const world = takeKitWorld(publicDir, q.worldId)
    return { ok: true, own: world && perfMatchesPack(world.perf, q.packId) ? { perf: world.perf, perfFrom: 'lock' } : null }
  }
  if (!isMocapPackId(q.packId)) return { ok: false, status: 400, error: PERF_NOT_MOCAP }
  const p = parsePerformancePlan(sent)
  if (!p.ok) return { ok: false, status: 400, error: `The walk sent with this take is not a performance: ${p.errors.join('; ')}` }
  if (mocapPackId(p.perf) !== q.packId) return { ok: false, status: 409, error: PERF_MISMATCH }
  return { ok: true, own: { perf: p.perf, perfFrom: 'lock' } }
}
