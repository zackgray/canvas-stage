// What a scene has sent out of the app: each time its finished shot is downloaded, the scene remembers it (Export's "Exported"
// list and the strip's Export cell read it). Kept in the browser, one list per scene, so one scene's exports are never another's.
import { useSyncExternalStore } from 'react'

export interface SceneExport {
  /** the take the shot is of */
  takeId: string
  /** the file downloaded */
  url: string
  /** the finished shot (else the raw render) */
  finished: boolean
  /** when it was downloaded (ISO) */
  at: string
}

const KEY = (scene: string) => `canvas-stage:scene-exports:${scene}`
const EMPTY: SceneExport[] = []
const subs = new Set<() => void>()
const cache = new Map<string, { raw: string | null; list: SceneExport[] }>()

/** this scene's downloads, newest first (the same array until the stored list changes) */
export function sceneExports(scene: string | null): SceneExport[] {
  if (!scene) return EMPTY
  let raw: string | null = null
  try { raw = localStorage.getItem(KEY(scene)) } catch { /* no storage: nothing is kept */ }
  const hit = cache.get(scene)
  if (hit && hit.raw === raw) return hit.list
  let list = EMPTY
  try { const p = raw ? JSON.parse(raw) as unknown : null; if (Array.isArray(p)) list = p.filter((e): e is SceneExport => !!e && typeof e.url === 'string' && typeof e.takeId === 'string') } catch { /* unreadable: none */ }
  cache.set(scene, { raw, list })
  return list
}

/** a download of the scene's shot: the same file again moves to the top instead of listing twice */
export function recordExport(scene: string | null, e: Omit<SceneExport, 'at'>, now = new Date()): void {
  if (!scene) return
  const next = [{ ...e, at: now.toISOString() }, ...sceneExports(scene).filter((x) => !(x.takeId === e.takeId && x.url === e.url))].slice(0, 50)
  try { localStorage.setItem(KEY(scene), JSON.stringify(next)) } catch { /* nothing to do */ }
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => {
  subs.add(f)
  window.addEventListener('storage', f) // another tab downloaded one
  return () => { subs.delete(f); window.removeEventListener('storage', f) }
}
export const useSceneExports = (scene: string | null): SceneExport[] => useSyncExternalStore(subscribe, () => sceneExports(scene))
