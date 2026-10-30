// The scene library as the Home screen reads it: the Resume list (thumbnail, name, stage reached, last edited) and its actions.
// Every action re-reads the list; a stale revision (another tab changed the scene) is said in `error`, never written over.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SceneSummary, SceneView } from '../shared/libraryContract'
import { libraryApi, StaleSceneError, type LibraryApi } from './api'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const DEFAULT_API = libraryApi()

export interface ScenesHook {
  /** last edited first; hidden ones left out */
  scenes: SceneSummary[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** a new, empty scene (open it with sceneHash(view.id)) */
  create: (name?: string) => Promise<SceneView | null>
  rename: (s: Pick<SceneSummary, 'id' | 'revision'>, name: string) => Promise<boolean>
  /** "Remove from list": the scene is hidden; its files stay */
  remove: (s: Pick<SceneSummary, 'id' | 'revision'>) => Promise<boolean>
}

export function useScenes(api: LibraryApi = DEFAULT_API): ScenesHook {
  const [scenes, setScenes] = useState<SceneSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    try { setScenes(await api.list()); setError(null) } catch (e) { setError(message(e)) } finally { setLoading(false) }
  }, [api])
  useEffect(() => { void refresh() }, [refresh])
  const act = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    let r: T | null = null, refused: string | null = null
    try { r = await fn() } catch (e) { refused = e instanceof StaleSceneError ? e.message : message(e) }
    await refresh() // a fresh list (and its revisions), so the next try is current
    if (refused) setError(refused) // said after the re-read, which would otherwise clear it
    return r
  }, [refresh])
  return useMemo(() => ({
    scenes, loading, error, refresh,
    create: (name?: string) => act(() => api.create(name)),
    rename: async (s: Pick<SceneSummary, 'id' | 'revision'>, name: string) => !!(await act(() => api.rename(s.id, name, s.revision))),
    remove: async (s: Pick<SceneSummary, 'id' | 'revision'>) => !!(await act(() => api.remove(s.id, s.revision))),
  }), [scenes, loading, error, refresh, act, api])
}

