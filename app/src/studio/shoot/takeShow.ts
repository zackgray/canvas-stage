// When a locked take's own walk and set are on the stage (PLAN-PER-TAKE-PERFORMANCE.md §1, §3; PLAN-PER-TAKE-SET.md S3). The take on show follows the current take
// (currentTake.ts: a pick, a restore, a lock) through one path, `syncTakeOnShow` (worldTakes.ts calls it whenever the current take
// or the takes list changes); the take's set (S3) rides the same path. The subject panel only ever edits the scene's walk: the
// first change to it while a locked take is on show sets that take aside (it leaves the stage, the scene's walk comes on, and a
// restore never brings it back until the owner picks it again); a save that only recasts the hero is no change to the walk.
import type { Stage } from '../../labs/projection/engine/Stage'
import { onSceneSetEdit } from '../../labs/projection/stage3d/setEditGate'
import { setTakeOnShow, takeOnShow, takeOnShowOf } from '../../labs/projection/stage3d/takeOnShow'
import type { TakeRecord } from '../../shared/shotContract'
import type { KitPerformance } from '../../../server/stage3d/types'
import { mocapPackId } from '../../stage3d/planHash'
import { currentTakeId, setCurrentTake } from './currentTake'
import { setOpenTake } from './openTake'
import { waitForSet } from './takeSetShow'

/** the one restore path: the current take's record (from the takes on disk) decides what is on show */
export function syncTakeOnShow(takes: readonly TakeRecord[], cur: string | null): void {
  const rec = cur ? takes.find((t) => t.id === cur) ?? null : null
  if (rec) clearAside(rec.worldId) // a take picked, restored or locked on the world: its scene-walk mode is over
  setTakeOnShow(takeOnShowOf(rec))
}

// the world whose take was set aside, remembered in this browser like the take pick (takePick.ts), so a reload does not put it back
const KEY = 'canvas-stage.take-aside'
const aside = new Map<string, string>()
function clearAside(worldId: string): void {
  if (!aside.has(worldId) && !readAside(worldId)) return
  aside.delete(worldId)
  try { localStorage.removeItem(`${KEY}.${worldId}`) } catch { /* storage off */ }
}
function readAside(worldId: string): string | null {
  try { return localStorage.getItem(`${KEY}.${worldId}`) } catch { return null }
}

/** the scene's walk is on show on this world by the owner's edit: no take is restored onto it (worldTakes.ts useRestoreTake) */
export const sceneWalkOn = (worldId: string | null | undefined): boolean => !!worldId && (aside.has(worldId) || !!readAside(worldId))

/** Set the take on show aside (its walk leaves the stage; the take itself is never touched). True when one was. */
export function setTakeAside(worldId: string): boolean {
  const s = takeOnShow()
  if (!s || s.worldId !== worldId) return false
  markAside(worldId, s.takeId)
  setTakeOnShow(null)
  if (currentTakeId() === s.takeId) setCurrentTake(null)
  return true
}
function markAside(worldId: string, takeId: string): void {
  aside.set(worldId, takeId) // first: the restore that runs when the current take clears must already see it
  try { localStorage.setItem(`${KEY}.${worldId}`, takeId) } catch { /* storage off: this page only */ }
  setOpenTake(worldId, true) // the scene's setup on show is the open take (openTake.ts): its row stays until a lock or a discard
}

/** The open take's row pressed, or New take: the scene's setup comes on show (the same set-aside as Edit the scene's set), also for
 *  a current take with no walk or set of its own (nothing of its own is on show, but it is still the current take). */
export function openSceneTake(worldId: string): void {
  if (setTakeAside(worldId)) return
  markAside(worldId, currentTakeId() ?? 'open')
  setCurrentTake(null)
}

/** The open take discarded: its row goes and a restore may bring the picked (or newest) take back on show. */
export function endOpenTake(worldId: string): void {
  clearAside(worldId)
  setOpenTake(worldId, false)
}
// the first set edit while a take whose set is the scene's is on show sets it aside too (setEditGate.ts): one set-aside for both
onSceneSetEdit(setTakeAside)

// the scene walk's pack id as last read, per world: a new one is an edit to the walk (Blocking, Walk to, the action, the shot length,
// the mark); the same one (a recast, a re-read) is not
const lastScene = new Map<string, string>()

/** The scene's walk as read now (useKit's world.perf). Its first read is no edit; a new pack id afterwards sets aside the take on
 *  show. True when a take was set aside. */
export function noteScenePerf(worldId: string, perf: KitPerformance | null): boolean {
  if (!perf) return false
  const pack = mocapPackId(perf)
  const before = lastScene.get(worldId)
  lastScene.set(worldId, pack)
  return before !== undefined && before !== pack ? setTakeAside(worldId) : false
}

/** the pack id of the performer the stage plays now (null = none); tolerant of a stub stage with no world */
export const stagePackId = (stage: Stage | null | undefined): string | null =>
  ((stage as { world?: { performance?: { pack?: { id?: string } } | null } } | null | undefined)?.world?.performance?.pack?.id) ?? null

/** Resolve true once the stage plays `packId` (polled; a figure is built in a few hundred ms), false after `timeoutMs`. */
export async function waitForPack(stage: Stage | null, packId: string, timeoutMs = 20000, stepMs = 50): Promise<boolean> {
  const end = Date.now() + timeoutMs
  for (;;) {
    if (stage && stagePackId(stage) === packId) return true
    if (Date.now() >= end) return false
    await new Promise((r) => setTimeout(r, stepMs))
  }
}

/**
 * Before frames are prepared or drawn for a take: its own walk and its own set on the stage, the stage's performer built from the
 * walk and the world built from the set (pieces loaded). A take with no copy of its own has nothing to load (the scene's walk and
 * set are the ones it can use, and the existing guards say when they are not). False when either never came on.
 */
export async function bringTake(stage: Stage | null, take: TakeRecord, timeoutMs?: number): Promise<boolean> {
  const want = takeOnShowOf(take)
  if (!want) return true
  if (takeOnShow()?.takeId !== take.id) setTakeOnShow(want)
  if (want.perf && !(await waitForPack(stage, take.packId!, timeoutMs))) return false
  return !want.plan || waitForSet(stage, want.setKey, timeoutMs)
}
/** the walk part of bringTake (WP3's name, kept for its callers) */
export const bringTakeWalk = bringTake

/** the pack Play must wait for: the take on show's walk on this world, else null (the scene's walk is already the one on stage) */
export function onShowPack(worldId: string | null | undefined): string | null {
  const s = takeOnShow()
  return s?.perf && worldId && s.worldId === worldId ? mocapPackId(s.perf) : null
}

/** tests only */
export function resetTakeShow(): void {
  for (const w of aside.keys()) { try { localStorage.removeItem(`${KEY}.${w}`) } catch { /* */ } }
  aside.clear(); lastScene.clear()
}
