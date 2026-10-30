import { useSyncExternalStore } from 'react'

/**
 * Whether the Stage's first-frame window is open over the viewport ('still': the edit window, the one place for the look and the
 * render) or the live 3D set shows ('3d'). (owner 10-29) It opens only when asked: the take card's first-frame thumbnail, or a draw
 * that just landed; the X and Esc close it. Nothing is lost by closing: the still stays with the take, the typed edit words with
 * the Stage (useFrameEdit, held by the draw bar).
 */
export type FrameView = 'still' | '3d'
let pick: { id: string; view: FrameView; also?: readonly string[] } | null = null
const subs = new Set<() => void>()
let version = 0

/** `also`: other stills the same view holds for (picking a version in the window: the old frame stays on show until the new
 *  approval is read back, so the window never closes in between) */
export function setFrameView(id: string, view: FrameView, also?: readonly string[]): void {
  if (pick?.id === id && pick.view === view && !also?.length) return
  pick = also?.length ? { id, view, also } : { id, view }
  version++
  subs.forEach((f) => f())
}

/** a press that wants the window on its Clip picture (the take card's Clip thumbnail; a render that landed while it was closed) */
let clipAsk = 0
export function showFrameClip(id: string): void {
  clipAsk++
  if (pick?.id === id && pick.view === 'still') { version++; subs.forEach((f) => f()) } else setFrameView(id, 'still')
}
export function useClipAsk(): number {
  useSyncExternalStore(subscribe, () => version)
  return clipAsk
}

/** the id the window opens on while a first draw prepares and draws (no frame yet): its working state (owner 10-29) */
export const PENDING_FRAME = 'pending'

/** a new version became the frame in use (a draw or an edit landed): an open window follows it and stays open across the swap */
export function followFrame(id: string): void {
  if (!pick || pick.view !== 'still' || pick.id === id) return
  setFrameView(id, 'still', [pick.id, ...(pick.also ?? [])].filter((x) => x !== id && x !== PENDING_FRAME).slice(0, 4))
}

/** the window is open on the pending (working) state */
export const framePending = (): boolean => pick?.id === PENDING_FRAME && pick.view === 'still'

/** the view for this still: open only when it was opened for this still (or one it holds for); closed otherwise */
export function frameViewOf(still: { id: string } | null, _approved?: boolean): FrameView {
  if (!still) return '3d'
  if (pick && (pick.id === still.id || pick.also?.includes(still.id))) return pick.view
  return '3d'
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export function useFrameView(still: { id: string } | null, approved?: boolean): FrameView {
  useSyncExternalStore(subscribe, () => version)
  return frameViewOf(still, approved)
}

/** tests only */
export function resetFrameView(): void { pick = null; clipAsk = 0; version++ }
