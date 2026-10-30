// The scene the studio is in (the route's scene id), shared by every stage screen: its document, its facts and its few actions.
// One module-level store, so screens and non-React modules (the job store, Render's store) read the same scene. The document is
// re-read every POLL_MS while any reader is mounted (a build attaches its world server-side; another tab may rename it). A write
// carries the revision it was read at; a 409 sets `stale` and the screens say "changed in another tab" with a Reload.
import { useEffect, useSyncExternalStore } from 'react'
import type { SceneView } from '../shared/libraryContract'
import { setCurrentTake } from '../studio/shoot/currentTake'
import { libraryApi, StaleSceneError, type LibraryApi } from './api'

export interface CurrentScene {
  id: string | null
  view: SceneView | null
  loading: boolean
  error: string | null
  /** a write was refused because the scene changed elsewhere: show the message and offer Reload */
  stale: boolean
}

const POLL_MS = 5000
let state: CurrentScene = { id: null, view: null, loading: false, error: null, stale: false }
let api: LibraryApi = libraryApi()
const subs = new Set<() => void>()
const set = (p: Partial<CurrentScene>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }
let users = 0
let timer: ReturnType<typeof setInterval> | null = null
let reads = 0

/** the scene id the studio is in, or null (non-React readers: the job store, Render's store) */
export const currentSceneId = (): string | null => state.id
/** the scene's current set (world id), or null before its first build */
export const currentWorldId = (): string | null => state.view?.worldId ?? null

export async function refreshScene(): Promise<void> {
  const id = state.id
  if (!id) return
  const n = ++reads
  try {
    const v = await api.get(id)
    if (n !== reads || state.id !== id) return
    set({ view: v, loading: false, error: v ? null : 'This scene is not in the library.' })
  } catch (e) { if (n === reads && state.id === id) set({ loading: false, error: e instanceof Error ? e.message : String(e) }) }
}

/** the studio's route names this scene: its document is read (and the old one's dropped at once, so nothing of it shows) */
export function openScene(id: string | null): void {
  if (state.id === id) return
  reads++
  setCurrentTake(null) // the last scene's take is never this one's (Shoot restores this scene's newest)
  set({ id, view: null, loading: !!id, error: null, stale: false })
  if (id) void refreshScene()
}

/** a revision-checked write: the stored copy replaces the shown one; a 409 marks the scene stale (nothing was written) */
async function write(fn: (v: SceneView) => Promise<SceneView>): Promise<boolean> {
  const v = state.view
  if (!v) return false
  try { const next = await fn(v); if (state.id === next.id) set({ view: next, error: null }); return true } catch (e) {
    if (e instanceof StaleSceneError) set({ stale: true, error: e.message })
    else set({ error: e instanceof Error ? e.message : String(e) })
    return false
  }
}

export const renameScene = (name: string) => write((v) => api.rename(v.id, name, v.revision))
/** "Remove from list" (hidden, nothing deleted) */
export const removeScene = () => write((v) => api.remove(v.id, v.revision))
/** one of this scene's own worlds becomes the current set (its takes are then the ones Shoot and Render list) */
export const pickSceneWorld = (worldId: string) => write((v) => api.setWorld(v.id, worldId, v.revision))
/** the stale note is answered by reading the scene again (a Reload of the page does the same, and more) */
export function reloadScene(): Promise<void> { set({ stale: false, error: null }); return refreshScene() }

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

/** the current scene, kept fresh while mounted */
export function useCurrentScene(): CurrentScene {
  const s = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    users++
    if (users === 1) timer = setInterval(() => void refreshScene(), POLL_MS)
    return () => { users--; if (users === 0 && timer) { clearInterval(timer); timer = null } }
  }, [])
  return s
}

/** tests only: a fresh store over `with` (an injected api) */
export function resetCurrentScene(withApi: LibraryApi = libraryApi()): void {
  api = withApi; reads++; users = 0; if (timer) { clearInterval(timer); timer = null }
  state = { id: null, view: null, loading: false, error: null, stale: false }
}
