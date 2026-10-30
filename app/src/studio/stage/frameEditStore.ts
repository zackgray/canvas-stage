// "Edit this frame" lives under the full-screen first frame (owner 10-29), not in the draw bar. The model (useFrameEdit) is held by
// the Stage's draw bar, which stays mounted while the Stage is open, so the typed words, the running edit and its result survive
// the still view closing and opening; this tiny store hands that model to the viewport's still view (HeroOverlay) and to the
// right panel's "editing…" pill. Nothing here spends or holds edit state of its own.
import { useSyncExternalStore } from 'react'
import type { FrameEditModel } from './useFrameEdit'

let current: FrameEditModel | null = null
const subs = new Set<() => void>()

export function publishFrameEdit(next: FrameEditModel | null): void {
  if (next === current) return
  current = next
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export function useFrameEditPublished(): FrameEditModel | null {
  return useSyncExternalStore(subscribe, () => current)
}
