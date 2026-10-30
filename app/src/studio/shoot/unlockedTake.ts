import { useEffect, useRef } from 'react'
import { currentSceneId } from '../../library/currentScene'
import { processTake, type ProcessedTake } from '../../labs/controller/take/processTake'

/**
 * A recorded take that is not locked yet lives only in the engine's memory, so a reload used to lose it. This keeps the scene's
 * latest unlocked take in the browser (one per scene) until it is locked, and puts it back when Shoot opens on its set with
 * nothing recorded. Locking it (the record on disk is then the take) clears the copy; recording again replaces it.
 */
const KEY = (scene: string) => `canvas-stage:unlocked-take:${scene}`

interface Saved {
  worldId: string
  raw: ProcessedTake['raw']
  viewAspect?: number
  trackHash?: string
  worldTrack?: ProcessedTake['worldTrack']
}

/** the slice of the engine's deck this reads and writes */
export interface UnlockedDeck { take: ProcessedTake | null; recording: boolean; takeCount: number; tolerance: number }

export function saveUnlocked(scene: string, worldId: string, take: ProcessedTake): void {
  const s: Saved = { worldId, raw: take.raw, viewAspect: take.viewAspect, trackHash: take.trackHash, worldTrack: take.worldTrack }
  // a full or blocked store only means this take is not kept across a reload, as before
  try { localStorage.setItem(KEY(scene), JSON.stringify(s)) } catch { /* nothing to do */ }
}

export function loadUnlocked(scene: string, worldId: string): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY(scene)) ?? 'null') as Saved | null
    return s && s.worldId === worldId && Array.isArray(s.raw?.samples) && s.raw.samples.length > 1 ? s : null
  } catch { return null }
}

export function clearUnlocked(scene: string): void {
  try { localStorage.removeItem(KEY(scene)) } catch { /* nothing to do */ }
}

/** the saved take becomes the deck's latest, as if it had just been recorded */
export function adoptUnlocked(deck: UnlockedDeck, s: Saved): ProcessedTake {
  const take = processTake(s.raw, deck.tolerance)
  if (s.viewAspect !== undefined) take.viewAspect = s.viewAspect
  if (s.trackHash !== undefined) take.trackHash = s.trackHash
  if (s.worldTrack) take.worldTrack = s.worldTrack
  deck.take = take
  deck.takeCount++
  return take
}

/**
 * The scene each take on the deck was recorded (or put back) in. The engine outlives a scene switch, so scene B's Shoot can open
 * with A's take still on the deck: it is A's (already kept under A's key), never saved under B's, and it leaves the deck so B
 * neither shows it nor locks it onto B's set. A take first seen while no scene owns it is the current scene's.
 */
const owners = new WeakMap<ProcessedTake, string>()
const ownerOf = (take: ProcessedTake, scene: string) => { if (!owners.has(take)) owners.set(take, scene); return owners.get(take)! }

/**
 * `locked`: the take in memory is the one locked on disk. Restores the scene's saved take once its set is on the stage and
 * nothing is recorded; keeps the copy in step with the deck's take until that take is locked.
 */
export function useUnlockedTake(deck: UnlockedDeck, worldId: string, locked: boolean, take: ProcessedTake | null): void {
  const scene = currentSceneId()
  const kept = useRef<ProcessedTake | null>(null)
  useEffect(() => {
    if (!scene || deck.recording) return
    // another scene's take still in the camera's memory: it is kept under its own scene, so it goes from this one's deck
    if (deck.take && ownerOf(deck.take, scene) !== scene) deck.take = null
    // no set on the stage yet (a scene with no world): nothing to put the take back on
    if (!worldId || deck.take) return
    const s = loadUnlocked(scene, worldId)
    if (s) { kept.current = adoptUnlocked(deck, s); owners.set(kept.current, scene) }
  }, [scene, worldId, deck])
  useEffect(() => {
    if (!scene || !take || ownerOf(take, scene) !== scene) return
    if (locked) { clearUnlocked(scene); kept.current = null; return }
    if (kept.current !== take) { kept.current = take; saveUnlocked(scene, worldId, take) }
  })
}
