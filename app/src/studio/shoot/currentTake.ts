import { useSyncExternalStore } from 'react'

/**
 * Which locked take the studio is working on: the one Shoot's TakeLockBlock just locked (or found already locked for the
 * take in memory). The hero block follows it, and Render opens on it when it has clay. In memory only: after a reload the
 * lock block finds the take's record on disk again and sets it; until then the readers fall back to the newest take.
 */
let current: string | null = null
const subs = new Set<() => void>()

/** stores that follow the current take outside React (the render store): never cleared by the tests' reset */
const followers = new Set<() => void>()

/** the current take was put on show by a pick (Render's shots list, Shoot's list) or a restore, not by the lock of the take in memory */
let shown = false

/** `onShow`: a pick or a restore (a take recorded afterwards supersedes it: worldTakes.ts useRestoreTake) */
export function setCurrentTake(id: string | null, onShow = false): void {
  shown = !!id && onShow
  if (id === current) return
  current = id
  subs.forEach((f) => f())
  followers.forEach((f) => f())
}

/** Calls `f` whenever the current take changes (a lock, a pick, a reload finding it); returns the unsubscribe. */
export function onCurrentTake(f: () => void): () => void { followers.add(f); return () => { followers.delete(f) } }

export const currentTakeId = (): string | null => current
/** the current take is a pick or a restore (setCurrentTake's `onShow`), not the lock of the take in memory */
export const currentTakeShown = (): boolean => shown

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useCurrentTakeId = (): string | null => useSyncExternalStore(subscribe, () => current)

/**
 * Whether the take in the engine's memory is locked as it stands (the lock block's own fact: its lock found, nothing changed since).
 * Separate from the current take on purpose (review F4): a ▶ or a row pick puts an older take on show, and an unlocked take in
 * memory must stay known as unlocked, so its Takes line stays and filming again still asks before replacing it.
 */
let memoryLocked = false
const memSubs = new Set<() => void>()

export function setMemoryTakeLocked(v: boolean): void {
  if (v === memoryLocked) return
  memoryLocked = v
  memSubs.forEach((f) => f())
}

const memSubscribe = (f: () => void) => { memSubs.add(f); return () => { memSubs.delete(f) } }
export const useMemoryTakeLocked = (): boolean => useSyncExternalStore(memSubscribe, () => memoryLocked)

/** tests only */
export function resetCurrentTake(): void { current = null; shown = false; subs.clear(); memoryLocked = false; memSubs.clear() }
