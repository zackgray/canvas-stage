/**
 * Each take keeps its own subject performance (cleanup-2026-10-29/PLAN-PER-TAKE-PERFORMANCE.md §2). Pure (no DOM, no node), so the
 * server and the page share it; shotContract.ts re-exports it and adds the fields to TakeRecord.
 *
 * The rule: a take that carries `perf` has `packId === 'mocap-' + planHash(perf)`. A copy that does not hash to its packId is
 * "unmatched" (the take needs locking again), never silently matched. The copy's castId is not the take's: who plays the hero is
 * one choice per scene, so a reader lays the scene's castId over the copy (withSceneCast).
 */
import type { KitPerformance } from '../../server/stage3d/types.ts'
import { mocapPackId } from '../stage3d/planHash.ts'

/** how a take got its copy: 'lock' = stored at Lock take (the performer the page sent, or the scene file when its hash matched);
 *  'adopted' = copied later from the scene's performance.json while that still hashed to the take's packId */
export type TakePerfFrom = 'lock' | 'adopted'

/** what a take's performance is: its own copy, an adopted copy, unmatched (the scene's walk moved on and no copy holds), or none
 *  (a take with no 3D performer: a null or non-mocap packId) */
export type TakePerfState = 'own' | 'adopted' | 'unmatched' | 'none'

/** the per-take fields of take.json (TakeRecord), both optional: takes locked before this have neither */
export interface TakePerfFields {
  /** the performance the take was locked with (path, actions, pace, gait, stand, shot length, extras); hashes to packId */
  perf?: KitPerformance
  perfFrom?: TakePerfFrom
}

/** the field the page's Lock take sends (POST /__lab/takes/lock): the performer actually playing (MocapLayer.plan). The server
 *  checks it hashes to the request's packId (409 PERF_MISMATCH otherwise). Absent (an older page): the scene's file is copied when
 *  its hash matches the packId, else the take is locked with no copy, as before. */
export interface TakeLockPerf { perf?: KitPerformance }

export const PERF_MISMATCH = 'The walk sent with this take is not the one the take was recorded with. Reload the page and lock the take again.'
export const PERF_NOT_MOCAP = 'A walk was sent with a take that has no 3D performer. Reload the page and lock the take again.'

export const isMocapPackId = (packId: string | null | undefined): packId is string => typeof packId === 'string' && packId.startsWith('mocap-')

/** true when `perf` is the performance `packId` names */
export const perfMatchesPack = (perf: KitPerformance | null | undefined, packId: string | null | undefined): boolean =>
  !!perf && isMocapPackId(packId) && mocapPackId(perf) === packId

/** the copy with the scene's cast laid over it (castId is not motion: planHash leaves it out, so this never changes the match);
 *  no scene performance to read = the copy as it is. A scene with no castId = the copy without one (the project's first card). */
export function withSceneCast(perf: KitPerformance, scene: Pick<KitPerformance, 'castId'> | null | undefined): KitPerformance {
  if (!scene) return perf
  const { castId: _copy, ...rest } = perf // eslint-disable-line @typescript-eslint/no-unused-vars
  return scene?.castId !== undefined ? { ...rest, castId: scene.castId } : rest
}
