// The locked take on show and what it brings onto the stage (PLAN-PER-TAKE-PERFORMANCE.md §3, PLAN-PER-TAKE-SET.md S3): a picked or
// restored take that keeps its own walk and its own set puts them on the stage in place of the scene's, so the performer, the set,
// the clay, frame 0, Play and Lock all see the take as it was locked. `takeOnShowOf` is the one place a take record becomes what is
// on show. Pure store: the studio decides when a take is on show (src/studio/shoot/takeShow.ts), useKit reads it.
import { useSyncExternalStore } from 'react'
import type { KitPerformance } from '../../../../server/stage3d/types'
import type { ScenePlan } from '../../../stage3d/contract'
import type { TakeRecord } from '../../../shared/shotContract'
import { perfMatchesPack, withSceneCast } from '../../../shared/takePerfContract'
import { setMatchesKey } from '../../../shared/takeSetContract'
import { mocapPackId } from '../../../stage3d/planHash'
import { setKeyOf } from '../../../studio/shoot/setKey'

export interface TakeOnShow {
  takeId: string
  /** the kit world the take was locked on: the stage plays the copy only on that world */
  worldId: string
  /** the take's own walk (TakeRecord.perf), checked against its packId; null = the scene's walk stands */
  perf: KitPerformance | null
  /** the take's own set (TakeRecord.set, checked against its setKey), or the scene's plan held while it was still the take's set
   *  (a take whose adopted copy has not been read yet); null = the scene's set stands */
  plan: ScenePlan | null
  /** the take's set key (TakeRecord.setKey; null = locked before set keys) */
  setKey: string | null
}

// the scene's set as useKit last read it, per world (noteSceneSet): a take whose key it is holds it while it is on show, so a piece
// landing on the scene afterwards never moves the take's set (Risk 2)
const scenes = new Map<string, ScenePlan>()
const sceneHeld = (worldId: string, setKey: string | null): ScenePlan | null => {
  const p = scenes.get(worldId)
  return p && setKey && setKeyOf(p) === setKey ? p : null
}

type TakeIn = Pick<TakeRecord, 'id' | 'worldId' | 'packId' | 'perf' | 'set' | 'setKey'>

/** What a take puts on the stage: its own walk when it holds one that is its packId's; its own set when it holds one that is its
 *  setKey's (else the set it already shows, when that is its key, else the scene's while it is still the take's). Null = nothing
 *  of its own (the scene's walk and set stand: a take with no copies, or copies that no longer match; it reads "lock the take
 *  again", as before). `prev`: what is on show now (a re-read never drops a set the take already holds). */
export function takeOnShowOf(take: TakeIn | null | undefined, prev: TakeOnShow | null = shown): TakeOnShow | null {
  if (!take) return null
  const perf = take.perf && perfMatchesPack(take.perf, take.packId) ? take.perf : null
  const setKey = take.setKey ?? null
  const plan = (setMatchesKey(take.set, setKey) ? take.set! : null)
    ?? (prev && prev.takeId === take.id && prev.plan && setKeyOf(prev.plan) === setKey ? prev.plan : null)
    ?? sceneHeld(take.worldId, setKey)
  if (!perf && !plan) return null
  return { takeId: take.id, worldId: take.worldId, perf, plan, setKey }
}

let shown: TakeOnShow | null = null
const subs = new Set<() => void>()
const keyOf = (v: TakeOnShow | null) => (v ? `${v.takeId}|${v.worldId}|${JSON.stringify(v.perf)}|${setKeyOf(v.plan)}` : '')

/** a new value only when something on show changed (a takes-list poll answering the same copy is no change) */
export function setTakeOnShow(v: TakeOnShow | null): void {
  if (keyOf(v) === keyOf(shown)) return
  shown = v
  subs.forEach((f) => f())
}

export const takeOnShow = (): TakeOnShow | null => shown
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useTakeOnShow = (): TakeOnShow | null => useSyncExternalStore(subscribe, () => shown)

/** the take on show on this world, or null */
export const takeOnShowFor = (v: TakeOnShow | null, worldId: string | null | undefined): TakeOnShow | null =>
  v && worldId && v.worldId === worldId ? v : null

/** The scene's set as read now (useKit). A take on show that holds no set yet and whose key it is takes it (the take was shown
 *  before the world was read). */
export function noteSceneSet(worldId: string, plan: ScenePlan): void {
  scenes.set(worldId, plan)
  const s = shown
  if (s && s.worldId === worldId && !s.plan && s.setKey && setKeyOf(plan) === s.setKey) setTakeOnShow({ ...s, plan })
}

/** the scene's set on this world as last read (null = not read yet) */
export const sceneSetOf = (worldId: string | null | undefined): ScenePlan | null => (worldId ? scenes.get(worldId) ?? null : null)

/**
 * The walk the stage plays: the take on show's own (with the scene's cast laid over it: who plays the hero is one choice per
 * scene), else the scene's. A copy that is the scene's walk (the same pack id) plays the scene's own object, so a take locked a
 * moment ago never rebuilds the figure (a rebuild mid-capture would abort a Prepare).
 */
export function stagePerf(scene: KitPerformance | null, onShow: TakeOnShow | null, worldId: string | null): KitPerformance | null {
  const s = takeOnShowFor(onShow, worldId)
  if (!s?.perf) return scene
  if (scene && mocapPackId(scene) === mocapPackId(s.perf)) return scene
  return withSceneCast(s.perf, scene)
}

/**
 * The take on show whose own set is not the scene's (both known), or null. While it is, the stage shows the take's set and the
 * viewport is read-only for the set (setEditGate.ts). A copy equal to the scene's set is null: the scene's own object stays on
 * the stage, so an equal set never rebuilds the world.
 */
export function ownSetOnShow(scene: ScenePlan | null, onShow: TakeOnShow | null, worldId: string | null): TakeOnShow | null {
  const s = takeOnShowFor(onShow, worldId)
  if (!s?.plan) return null
  return scene && setKeyOf(scene) === setKeyOf(s.plan) ? null : s
}

/** tests only */
export function resetTakeOnShow(): void { shown = null; scenes.clear(); subs.forEach((f) => f()) }
