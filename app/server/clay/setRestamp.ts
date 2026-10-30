/**
 * The set side of a clay finish (PLAN-PER-TAKE-SET.md, Re-prepare). The camera path, lens, timing and performance are the take's own
 * and stay as recorded, so a take whose frames are prepared again is the same take.
 *
 * - A take WITH its own set (a copy that hashes to its setKey) is prepared from that set: the finish must carry the take's own key
 *   (`setKey` on the body, the key of the set every frame was captured on), else it is refused free (409, nothing written). An older
 *   page that sends no key is refused too while the scene's set is another one, since it captured the scene's. Its key and copy are
 *   never restamped.
 * - A take with NO copy (or one that does not hash) is prepared on the scene's set: a sent key must be the scene's key now (else 409).
 *   After the finish starts, the take records that key (the one the page SENT, so frames and take agree even if the set moves after)
 *   and a copy of the scene's set (setFrom 'reprepare', setSince = the world's kit.setChangedAt now): from then on it keeps its set.
 *   An older page sends none: the scene's key now is stamped, as before.
 * - A take with no set key (locked before keys, or off a kit world) is left alone. Never throws.
 */
import path from 'node:path'
import { shotPaths, type TakeRecord } from '../../src/shared/shotContract.ts'
import { SET_STAMP_MISMATCH } from '../../src/shared/setStampContract.ts'
import { setKeyOf } from '../../src/studio/shoot/setKey.ts'
import { currentSetKey } from '../bible/setGate.ts'
import { KitStore } from '../stage3d/store.ts'
import { bareWorldId, takeKitWorld } from '../stage3d/takeWorld.ts'
import { hasOwnSet } from '../takes/setJudge.ts'
import { readTake, writeJson } from '../takes/store.ts'

export const SET_STAMP_UNSENT = 'This take keeps its own set, and the page did not say which set these frames were captured on. Reload the page, pick the take again, then prepare the frames again (free). Nothing was saved.'

const keyNow = (publicDir: string, worldId: string): string | null => { try { return currentSetKey(publicDir, worldId) } catch { return null } }

/** a finish whose set is not the one the take is prepared on: the 409's words, else null. `sent` = the body's setKey (undefined = none sent) */
export function setFinishRefusal(publicDir: string, take: TakeRecord, sent: string | null | undefined): string | null {
  if (!take.setKey) return null
  if (hasOwnSet(take)) {
    if (sent !== undefined) return sent === take.setKey ? null : SET_STAMP_MISMATCH
    return keyNow(publicDir, take.worldId) === take.setKey ? null : SET_STAMP_UNSENT
  }
  if (sent === undefined) return null
  return sent !== null && sent === keyNow(publicDir, take.worldId) ? null : SET_STAMP_MISMATCH
}

/** (after a finish started) a take with no copy of its own records the set its new frames are on; the key written, or null when nothing was */
export function restampSetKey(publicDir: string, take: TakeRecord, sent?: string | null): string | null {
  if (!take.setKey || hasOwnSet(take)) return null
  const key = sent !== undefined ? sent : keyNow(publicDir, take.worldId)
  if (!key) return null
  const rec = readTake(publicDir, take.id)
  if (!rec || hasOwnSet(rec)) return null
  const scene = takeKitWorld(publicDir, take.worldId)
  let since: string | null = null
  try { since = new KitStore(publicDir).setChangedAt(bareWorldId(take.worldId)) } catch { /* no date: the copy says never changed */ }
  const copy = scene && setKeyOf(scene.plan) === key ? { set: scene.plan, setFrom: 'reprepare' as const, setSince: since } : {}
  if (key === rec.setKey && !('set' in copy)) return null
  writeJson(path.join(publicDir, shotPaths(take.id).take), { ...rec, setKey: key, ...copy } satisfies TakeRecord)
  return key
}
