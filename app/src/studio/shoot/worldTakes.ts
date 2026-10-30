import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { ProcessedTake } from '../../labs/controller/take/processTake'
import { KIT_CHANGED } from '../../labs/projection/stage3d/kitApi'
import type { TakeRecord } from '../../shared/shotContract'
import type {} from '../../shared/takeWordsContract'
import { currentTakeId, currentTakeShown, onCurrentTake, setCurrentTake, useCurrentTakeId } from './currentTake'
import { fetchTakes } from './heroApi'
import { readTakePick } from './takePick'
import { sceneWalkOn, syncTakeOnShow } from './takeShow'

/**
 * The locked takes on disk, shared by Shoot's Takes list, the pipeline strip and the restore below: one poll while any reader is
 * mounted. A reload empties the engine's memory but not the disk, so the world's takes are read from here, never from the deck's count.
 */
let all: TakeRecord[] = []
let loaded = false
const subs = new Set<() => void>()
let users = 0
let timer: ReturnType<typeof setInterval> | null = null
const POLL_MS = 4000
// the take on show (its own walk on the stage) follows the current take and its record on disk, through one path (takeShow.ts)
const syncShow = () => syncTakeOnShow(all, currentTakeId())
onCurrentTake(syncShow)

/** the same take as read last: its id, start, name, words, its own walk and its own set (a copy adopted since is a change: it
 *  goes on show) */
const same = (a: TakeRecord, b: TakeRecord) => a.id === b.id && a.startKey === b.startKey && a.name === b.name && a.prompt === b.prompt &&
  a.sceneBase === b.sceneBase && a.packId === b.packId && a.perfFrom === b.perfFrom && JSON.stringify(a.perf ?? null) === JSON.stringify(b.perf ?? null) &&
  a.setKey === b.setKey && a.setFrom === b.setFrom && JSON.stringify(a.set ?? null) === JSON.stringify(b.set ?? null)

let gen = 0
export async function refreshLockedTakes(): Promise<void> {
  const g = gen
  const next = await fetchTakes()
  if (g !== gen) return // read before a reset (tests): never written over the list since
  // a take's name or words changed (the take list) is a change too: the readers show the take as it is now
  if (loaded && next.length === all.length && next.every((t, i) => same(t, all[i]))) return
  all = next; loaded = true
  syncShow()
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
// a set change adopts the set into the takes still on it (server, before the write): they are read again at once, not at the poll
const onKit = () => void refreshLockedTakes()

/** a reader of the shared list: the one poll runs while any is mounted; each reads at once on mount and on a take switch (the
 *  reads of a burst share their request: heroApi fetchTakes) */
function useTakesPoll(): TakeRecord[] {
  const list = useSyncExternalStore(subscribe, () => all)
  const cur = useCurrentTakeId()
  useEffect(() => {
    users++
    void refreshLockedTakes()
    if (users === 1) { timer = setInterval(() => void refreshLockedTakes(), POLL_MS); window.addEventListener(KIT_CHANGED, onKit) }
    return () => { users--; if (users === 0) { window.removeEventListener(KIT_CHANGED, onKit); if (timer) { clearInterval(timer); timer = null } } }
  }, [])
  useEffect(() => { void refreshLockedTakes() }, [cur]) // a take just locked shows at once
  return list
}

/** the world's locked takes, newest lock first (empty until the list has loaded, or for no world) */
export function useLockedTakes(worldId: string | null): TakeRecord[] {
  const list = useTakesPoll()
  return useMemo(() => (worldId ? list.filter((t) => t.worldId === worldId).sort((a, b) => b.lockedAt.localeCompare(a.lockedAt)) : []), [list, worldId])
}

/** every locked take on disk (any world), from the same shared poll; null until the list has loaded once (fix 2026-10-30: the
 *  hero block and the frame edit polled the full list on timers of their own) */
export function useAllTakes(): TakeRecord[] | null {
  const list = useTakesPoll()
  return loaded ? list : null
}

/**
 * After a reload nothing is recorded in memory but the world's locked takes are on disk: the take picked for the world (takePick.ts),
 * else the newest, becomes the current take (the hero block and Render follow it) instead of "Lock a take first". Only while nothing is recorded; a take recorded afterwards that
 * is not locked clears it again (the hero block must never film against a take other than the one on show). A pick (Shoot's list,
 * `pickTake`, or Render's shots list) is the owner's and stays until a take is recorded: a fresh recording, or an unlocked take put
 * back in memory, supersedes it (review F1: Render stayed live for the picked take while the viewport held the new one), until that
 * take is locked. A current take locked on another world (another scene's) is dropped for this world's newest.
 */
export function useRestoreTake(memoryTake: ProcessedTake | null, lockedId: string | null | undefined, takes: TakeRecord[]): void {
  const hasMemoryTake = !!memoryTake
  const restored = useRef<string | null>(null)
  const cur = useCurrentTakeId()
  // the recording in memory, by its raw track (a smoothing change keeps it; a new recording or a take put back is another one)
  const recording = memoryTake?.raw ?? null
  const seen = useRef(recording)
  // the take picked for this world (Render's list, or the last lock), while it is still on disk; else the newest
  const picked = readTakePick(takes[0]?.worldId)
  const newest = takes.find((t) => t.id === picked)?.id ?? takes[0]?.id ?? null
  // the current take is the world's: one locked on another world (another scene's, M-1) is on disk but not in this world's list
  const disk = useSyncExternalStore(subscribe, () => all)
  const elsewhere = !!cur && !takes.some((t) => t.id === cur) && disk.some((t) => t.id === cur)
  // the owner's edit set the take on show aside (takeShow.ts): the scene's walk stays on, no take is restored over it
  const aside = sceneWalkOn(takes[0]?.worldId)
  useEffect(() => {
    const back = hasMemoryTake || aside ? null : newest
    if (elsewhere) { setCurrentTake(back, true); restored.current = back }
    else if (!hasMemoryTake && !aside && !cur && newest) { setCurrentTake(newest, true); restored.current = newest }
    else if (hasMemoryTake && restored.current && cur === restored.current && lockedId !== restored.current) { setCurrentTake(null); restored.current = null }
  }, [hasMemoryTake, cur, newest, lockedId, elsewhere, aside])
  useEffect(() => { if (cur && cur !== restored.current) restored.current = null }, [cur])
  useEffect(() => {
    if (recording === seen.current) return
    seen.current = recording
    // a pick or a restore is superseded; the take's own lock (the lock block's, takeLock.ts) stands
    if (recording && currentTakeShown()) { setCurrentTake(null); restored.current = null }
  }, [recording])
}

/** the owner picked a locked take from Shoot's list */
export const pickTake = (id: string) => setCurrentTake(id, true)

/** tests only */
export function resetLockedTakes(): void {
  all = []; loaded = false; users = 0; gen++; if (timer) { clearInterval(timer); timer = null }
  ;(fetchTakes as Partial<typeof fetchTakes>).reset?.()
  if (typeof window !== 'undefined') window.removeEventListener(KIT_CHANGED, onKit)
}
