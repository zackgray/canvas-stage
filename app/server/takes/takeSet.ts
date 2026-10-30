/**
 * A take's own set (PLAN-PER-TAKE-SET.md; the rule is in src/shared/takeSetContract.ts): what it is (takeSetOf), the copy Lock take
 * stores (lockSet), and adoption of the scene's plan.json into the takes locked on it (adoptSceneSet, adoptAllSets; the write itself
 * is adopt.ts adoptSetInto, which the kit store also calls inside changePlan before it writes plan.json). Free, local.
 */
import type { ScenePlan } from '../../src/stage3d/contract.ts'
import { parsePlan } from '../../src/stage3d/plan.ts'
import { setKeyOf } from '../../src/studio/shoot/setKey.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import {
  SET_MISMATCH, SET_WITHOUT_KEY, setMatchesKey, type TakeSetFields, type TakeSetState,
} from '../../src/shared/takeSetContract.ts'
import { KitStore } from '../stage3d/store.ts'
import { bareWorldId, takeKitWorld } from '../stage3d/takeWorld.ts'
import { adoptSetInto } from './adopt.ts'
import { listTakes } from './takeFiles.ts'

export interface TakeSet {
  state: TakeSetState
  /** the set the take was locked on: null for 'unmatched' and 'none' */
  set: ScenePlan | null
}

/**
 * What set the take is on. `world` = the take's scene (takeKitWorld), whose plan stands in for a take with no copy while it still
 * hashes to the setKey and `framesBehind` is false (adopt.ts framesBehind: the take's frames were made before the set last changed);
 * state 'adopted' then, and the next adoption writes that copy. A copy that does not hash to the setKey is 'unmatched', never
 * silently matched; so is a keyed take with no copy whose scene is on another set. No setKey = 'none'.
 */
export function takeSetOf(take: Pick<TakeRecord, 'setKey' | 'set' | 'setFrom'>, world: { plan: ScenePlan } | null, framesBehind = false): TakeSet {
  if (!take.setKey) return { state: 'none', set: null }
  if (take.set) {
    if (!setMatchesKey(take.set, take.setKey)) return { state: 'unmatched', set: null }
    return { state: take.setFrom === 'adopted' ? 'adopted' : 'own', set: take.set }
  }
  if (world && !framesBehind && setMatchesKey(world.plan, take.setKey)) return { state: 'adopted', set: world.plan }
  return { state: 'unmatched', set: null }
}

/** the scene's plan and its setChangedAt now, or null off a kit world / a plan that does not read */
function sceneSet(publicDir: string, worldId: string): { plan: ScenePlan; since: string | null } | null {
  const w = takeKitWorld(publicDir, worldId)
  if (!w) return null
  let since: string | null = null
  try { since = new KitStore(publicDir).setChangedAt(bareWorldId(worldId)) } catch { return null }
  return { plan: w.plan, since }
}

/** copy the scene's plan.json into every take of `worldId` locked on it, with no copy and frames not behind -> the ids adopted now */
export function adoptSceneSet(publicDir: string, worldId: string, takes?: readonly TakeRecord[]): string[] {
  const s = sceneSet(publicDir, worldId)
  return s ? adoptSetInto(publicDir, bareWorldId(worldId), s.plan, s.since, takes) : []
}

/** (the takes list GET) set adoption for every world that has a keyed take without a set copy -> the ids adopted now */
export function adoptAllSets(publicDir: string, takes: readonly TakeRecord[] = listTakes(publicDir)): string[] {
  const worlds = new Set(takes.filter((t) => !t.set && !!t.setKey).map((t) => bareWorldId(t.worldId)))
  return [...worlds].flatMap((id) => adoptSceneSet(publicDir, id, takes))
}

export type LockSet = { ok: true; own: Required<TakeSetFields> | null } | { ok: false; status: number; error: string }

/**
 * The set copy a lock stores. `sent` = the request's `set` (TakeLockSet): parsed as the kit store parses plan.json, then it must
 * hash to the request's setKey (409 SET_MISMATCH otherwise; the take is not locked). Nothing sent (an older page): the scene's
 * plan.json when its key is the setKey, else no copy, as before this existed. A take with no setKey keeps none.
 */
export function lockSet(publicDir: string, q: { worldId: string; setKey?: string }, sent: unknown): LockSet {
  if (sent === undefined || sent === null) {
    if (!q.setKey) return { ok: true, own: null }
    const s = sceneSet(publicDir, q.worldId)
    return { ok: true, own: s && setKeyOf(s.plan) === q.setKey ? { set: s.plan, setFrom: 'lock', setSince: s.since } : null }
  }
  if (!q.setKey) return { ok: false, status: 400, error: SET_WITHOUT_KEY }
  const p = parsePlan(sent)
  if (!p.ok) return { ok: false, status: 400, error: `The set sent with this take is not a set plan: ${p.errors.join('; ')}` }
  if (setKeyOf(p.plan) !== q.setKey) return { ok: false, status: 409, error: SET_MISMATCH }
  const s = sceneSet(publicDir, q.worldId)
  return { ok: true, own: { set: p.plan, setFrom: 'lock', setSince: s?.since ?? null } }
}
