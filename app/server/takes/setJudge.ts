/**
 * Were a take's frames (its clay) or a still made on the take's set? (PLAN-PER-TAKE-SET.md, Guards; Risk 1: a render or still must never
 * use a set different from the frames it was prepared with.) One rule for both, so Render's readiness, the clay's status, the still's
 * press, its preview and the stills list agree:
 *
 * - A stamp (ClayExport.setKey / HeroStill.setKey, setStampContract.ts) that is not a keyed take's setKey: moved, whatever the take is.
 * - A take WITH its own set (a copy that hashes to its setKey): judged by key. Stamped and equal: on the set. Unstamped (made before
 *   the stamp): on the set iff made at or after take.setSince (the set's last change when the copy was made; null = never changed).
 *   The scene's set changing later never moves these frames: that is the point of the copy.
 * - A take with NO copy (or one that does not hash): today's rule exactly, the world's meta.json kit.setChangedAt after the making.
 *
 * -> the moment the set moved past the made thing (an ISO date when one is known), or null when it is on the take's set or there is no
 * date to judge by. Free, read-only, never throws.
 */
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { setMatchesKey } from '../../src/shared/takeSetContract.ts'
import { KitStore } from '../stage3d/store.ts'
import { bareWorldId, isKitWorld } from '../stage3d/takeWorld.ts'

export type SetJudgeTake = Pick<TakeRecord, 'worldId' | 'setKey' | 'set' | 'setSince'>
/** what was made: its set stamp (absent = made before stamps) and when it was made */
export interface Made { setKey?: string | null; at: string | undefined }

/** true when the take holds its own copy of the set it was locked on (takeSetContract.ts: the copy hashes to the setKey) */
export const hasOwnSet = (take: Pick<TakeRecord, 'setKey' | 'set'>): boolean => setMatchesKey(take.set, take.setKey)

/** the world's set change after `made` (today's rule): null when nothing changed since, off a kit world, or a world that does not read */
function sceneMovedAfter(publicDir: string, worldId: string, made: number): string | null {
  if (!isKitWorld(publicDir, worldId)) return null
  let changed: string | null = null
  try { changed = new KitStore(publicDir).setChangedAt(bareWorldId(worldId)) } catch { return null }
  return changed && Date.parse(changed) > made ? changed : null
}

/** the set moved past what was made (see the header), or null */
export function setMovedFor(publicDir: string, take: SetJudgeTake, made: Made): string | null {
  if (take.setKey && made.setKey !== undefined && made.setKey !== take.setKey) return take.setSince ?? 'another set'
  const at = Date.parse(made.at ?? '')
  if (hasOwnSet(take)) {
    if (made.setKey !== undefined || !Number.isFinite(at)) return null
    const since = take.setSince ? Date.parse(take.setSince) : NaN
    return Number.isFinite(since) && since > at ? take.setSince! : null
  }
  if (!Number.isFinite(at)) return null
  return sceneMovedAfter(publicDir, take.worldId, at)
}
