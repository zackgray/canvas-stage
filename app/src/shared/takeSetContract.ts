/**
 * Each take keeps its own set (cleanup-2026-10-29/PLAN-PER-TAKE-SET.md, sibling of takePerfContract.ts). Pure (no DOM, no node), so
 * the server and the page share it; shotContract.ts adds the fields to TakeRecord in one line (import them from here).
 *
 * The rule: a take that carries `set` has `setKey === setKeyOf(set)` (shoot/setKey.ts, the hash the page computes over the kit plan).
 * A copy that does not hash to its setKey is "unmatched" (the take needs locking again), never silently matched. Only plan.json is
 * copied: built pieces stay where they were built (locations/<w>/pieces/...) and the copy names them by URL, so nothing may delete a
 * built piece's folder (pinned by server/takes/__tests__/piecesKept.test.ts). plan.built.json, the master, its depth, the still and
 * the set approval stay scene-level.
 */
import type { ScenePlan } from '../stage3d/contract.ts'
import { setKeyOf } from '../studio/shoot/setKey.ts'

/** how a take got its copy: 'lock' = stored at Lock take (the plan the page sent, or the scene file when its key matched);
 *  'adopted' = copied later from the scene's plan.json while that still hashed to the take's setKey and its frames were on it;
 *  'reprepare' = (S2) copied when the take's frames were prepared again on the scene's set */
export type TakeSetFrom = 'lock' | 'adopted' | 'reprepare'

/** what a take's set is: its own copy, an adopted copy, unmatched (the scene's set moved on and no copy holds, or a copy that does
 *  not hash to the setKey), or none (a take with no setKey: locked before set keys, or off a kit world) */
export type TakeSetState = 'own' | 'adopted' | 'unmatched' | 'none'

/** the per-take set fields of take.json (TakeRecord), all optional: takes locked before this have none */
export interface TakeSetFields {
  /** the kit set plan the take was locked on (as parsePlan returns it); hashes to setKey */
  set?: ScenePlan
  setFrom?: TakeSetFrom
  /** the world's meta.json kit.setChangedAt at the moment the copy was made (null = the set had never changed) */
  setSince?: string | null
}

/** the field the page's Lock take sends (POST /__lab/takes/lock): the kit plan on the stage. The server parses it as the kit store
 *  parses plan.json, hashes it and refuses one that is not the request's setKey (409 SET_MISMATCH). Absent (an older page): the
 *  scene's plan.json is copied when its key is the setKey, else the take is locked with no copy, as before. */
export interface TakeLockSet { set?: ScenePlan }

export const SET_MISMATCH = 'The set sent with this take is not the one the take was recorded on. Reload the page and lock the take again.'
export const SET_WITHOUT_KEY = 'A set was sent with a take that has no set key. Reload the page and lock the take again.'

/** true when `set` is the set `setKey` names */
export const setMatchesKey = (set: ScenePlan | null | undefined, setKey: string | null | undefined): boolean =>
  !!set && typeof setKey === 'string' && setKey.length > 0 && setKeyOf(set) === setKey
