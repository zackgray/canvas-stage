/**
 * The set approval gate (src/shared/setApproval.ts), the server's half: the master draw, the master preview and the hero-still press
 * each ask `setRefusalFor` first and refuse in plain words (409) before any job, claim, intent or ledger row. The key is the one
 * Shoot computes (setKeyOf over the kit plan), read from the plan on disk, so a piece built or moved by any page stales it here.
 * A world that is not a kit world has no set and is not gated; a kit world whose plan does not read refuses (it fails closed).
 * (per-take set) The still press names its take: a take that keeps its own set (a copy that hashes to its key) passes only when that
 * key was ever approved on the world (setKeys.ts), whatever the scene's set is now; every other press keeps the scene-level rule.
 */
import { setApprovalState, setRefusal } from '../../src/shared/setApproval.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { setMatchesKey } from '../../src/shared/takeSetContract.ts'
import { setKeyOf } from '../../src/studio/shoot/setKey.ts'
import { KitStore } from '../stage3d/store.ts'
import { listTakes } from '../takes/takeFiles.ts'
import { bareWorldId, isKitWorld } from '../stage3d/takeWorld.ts'
import { readSetApproval } from './read.ts'
import { approvedSetKeys } from './setKeys.ts'

/** the world's set key now (null = not a kit world); a kit world whose plan is broken throws (KitError 409) */
export function currentSetKey(publicDir: string, worldId: string): string | null {
  if (!isKitWorld(publicDir, worldId)) return null
  return setKeyOf(new KitStore(publicDir).read(bareWorldId(worldId)).plan)
}

/** the refusal for a press on this world's set (its plain words), or null when the set is approved at its current key or there is no
 *  set. `take`: the still press's take; one with its own set is judged by its own key instead (approved at any time on this world). */
export function setRefusalFor(publicDir: string, worldId: string, take?: Pick<TakeRecord, 'setKey' | 'set'>): string | null {
  const key = currentSetKey(publicDir, worldId)
  if (key === null) return null
  // (review F1) an own set is judged ONLY by its own key: the scene's approval says nothing about the set the still is drawn on
  if (take && setMatchesKey(take.set, take.setKey)) {
    if (approvedSetKeys(publicDir, worldId).includes(take.setKey!)) return null
    return setRefusal(setApprovalState(readSetApproval(publicDir, worldId), take.setKey!)) // never approved: 'none'; else 'stale'
  }
  return setRefusal(setApprovalState(readSetApproval(publicDir, worldId), key))
}

/** (review F1) the key POST /set/approve may approve on this world: the scene's current key (no `sent`, or `sent` is it), or the
 *  set key of a locked take of this world that holds that set (a copy hashing to it). Anything else: null (the route refuses). */
export function approvableSetKey(publicDir: string, worldId: string, sent: unknown): { key: string; scene: boolean } | null {
  const scene = currentSetKey(publicDir, worldId)
  if (sent === undefined || sent === null || sent === scene) return scene === null ? null : { key: scene, scene: true }
  if (typeof sent !== 'string' || !sent) return null
  const w = bareWorldId(worldId)
  const held = listTakes(publicDir).some((t) => bareWorldId(t.worldId) === w && t.setKey === sent && setMatchesKey(t.set, t.setKey))
  return held ? { key: sent, scene: false } : null
}
