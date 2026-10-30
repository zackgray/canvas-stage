/**
 * The world a take plays, as the back half (still, judge, face passes, render words) needs it: the take's scene (takeKitWorld)
 * with the take's OWN performance and OWN set in place of the scene's (cleanup-2026-10-29/PLAN-PER-TAKE-PERFORMANCE.md §3,
 * PLAN-PER-TAKE-SET.md: `take.set ?? scene.plan`). The single switch every server reader of a take's world goes through, so the
 * still's and the render's words (the pieces in view, their tags, the ground) are the take's set's, not the scene's as it moved on.
 *
 * - perf 'own' / 'adopted': the take's copy (takePerfOf), the scene's castId laid over it (who plays the hero is one choice per scene).
 *   'unmatched' / 'none': the scene's performance, as before this existed (the clay's pack stamp and the page guard those).
 * - plan 'own' / 'adopted': the take's set (takeSetOf, told whether the take's frames are behind the scene's last set change).
 *   'unmatched' / 'none': the scene's plan, as before (Render's set guards refuse a paid press whose frames are on another set).
 * The master, its depth and camera, the still and the set approval stay scene-level (they are read off the scene, not from here).
 * Lives beside takeWorld.ts, not in it: takes/takePerf.ts reads takeKitWorld, so one file would import itself in a circle. Read-only.
 */
import type { TakePerfState, TakeRecord } from '../../src/shared/shotContract.ts'
import type { TakeSetState } from '../../src/shared/takeSetContract.ts'
import { framesBehind } from '../takes/adopt.ts'
import { takePerfOf } from '../takes/takePerf.ts'
import { takeSetOf } from '../takes/takeSet.ts'
import { KitStore } from './store.ts'
import { bareWorldId, takeKitWorld } from './takeWorld.ts'
import type { KitWorld } from './types.ts'

/** a take's world: KitWorld with `perf` and `plan` = what the take plays and is set on, and how each was decided */
export interface TakeKitWorld extends KitWorld {
  /** where `perf` came from: the take's copy ('own' | 'adopted') or the scene's file ('unmatched' | 'none') */
  perfState: TakePerfState
  /** where `plan` came from: the take's set ('own' | 'adopted') or the scene's plan.json ('unmatched' | 'none') */
  setState: TakeSetState
}

export type TakeWorldKey = Pick<TakeRecord, 'worldId' | 'packId' | 'perf' | 'perfFrom'>
  & Partial<Pick<TakeRecord, 'id' | 'lockedAt' | 'setKey' | 'set' | 'setFrom'>>

/** a keyed take with no copy: are its frames behind the scene's last set change? (a take named without id/lockedAt cannot say: no) */
function behind(publicDir: string, take: TakeWorldKey): boolean {
  if (take.set || !take.setKey || !take.id || !take.lockedAt) return false
  let since: string | null = null
  try { since = new KitStore(publicDir).setChangedAt(bareWorldId(take.worldId)) } catch { return false }
  return framesBehind(publicDir, { id: take.id, lockedAt: take.lockedAt }, since)
}

/** the kit world behind the take with the take's performance and set, or null when the take is not on a kit world (or its files do not read) */
export function takeKitWorldFor(publicDir: string, take: TakeWorldKey): TakeKitWorld | null {
  const scene = takeKitWorld(publicDir, take.worldId)
  if (!scene) return null
  const tp = takePerfOf(take, scene)
  const ts = takeSetOf(take, scene, behind(publicDir, take))
  return { ...scene, perf: tp.perf ?? scene.perf, perfState: tp.state, plan: ts.set ?? scene.plan, setState: ts.state }
}
