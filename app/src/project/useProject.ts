// The project as the stage pages read and edit it (t24). Loads the project (bootstrapping the default one from
// today's files when none exists yet), saves whole documents with their revision, and derives every shot's staleness.
// Edits run one at a time, each on the newest saved copy, so two quick edits never race each other into a 409.
// A 409 (the file changed under us: another tab, a hand edit) reloads the project and reports it in `error`.
// Every action resolves true on success and false on failure, with the reason in `error`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bootstrapProject, getProject, postVersion, saveProject, StaleRevisionError } from './api.ts'
import { DEFAULT_PROJECT, upsertShot, type IngredientKind, type PayloadOf, type Project, type Shot, type Uses } from './model.ts'
import { staleness as staleOf, type ShotStaleness } from './stale.ts'

export interface ProjectHook {
  project: Project | null
  /** by shot id; empty until the project loads */
  staleness: Record<string, ShotStaleness>
  loading: boolean
  error: string | null
  saveShot: (shot: Shot) => Promise<boolean>
  addVersion: <K extends IngredientKind>(kind: K, id: string, payload: PayloadOf[K], name?: string) => Promise<boolean>
  setUses: (shotId: string, uses: Uses) => Promise<boolean>
  refresh: () => Promise<void>
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The project, bootstrapping the default one from today's files when it does not exist yet. */
async function fetchProject(id: string): Promise<Project> {
  const p = (await getProject(id)) ?? (id === DEFAULT_PROJECT ? (await bootstrapProject()).project : null)
  if (!p) throw new Error(`no project "${id}"`)
  return p
}

export function useProject(projectId: string = DEFAULT_PROJECT): ProjectHook {
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const current = useRef<Project | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const show = useCallback((p: Project) => {
    current.current = p
    setProject(p)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      show(await fetchProject(projectId))
      setError(null)
    } catch (e) {
      setError(message(e))
    } finally {
      setLoading(false)
    }
  }, [projectId, show])

  useEffect(() => {
    let live = true
    fetchProject(projectId).then((p) => { if (live) { show(p); setError(null) } }, (e: unknown) => { if (live) setError(message(e)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [projectId, show])

  /** Runs `op` on the newest project after every earlier edit has finished. */
  const edit = useCallback((op: (p: Project) => Promise<Project>): Promise<boolean> => {
    const run = queue.current.then(async () => {
      const p = current.current
      if (!p) { setError('the project is not loaded'); return false }
      try {
        show(await op(p))
        setError(null)
        return true
      } catch (e) {
        if (e instanceof StaleRevisionError) {
          await refresh()
          setError(`The project changed elsewhere and was reloaded; your last edit was not saved (${e.message}).`)
        } else setError(message(e))
        return false
      }
    })
    queue.current = run
    return run
  }, [refresh, show])

  const saveShot = useCallback((shot: Shot) => edit((p) => saveProject(upsertShot(p, shot))), [edit])

  const setUses = useCallback((shotId: string, uses: Uses) => edit(async (p) => {
    const shot = p.shots.find((s) => s.id === shotId)
    if (!shot) throw new Error(`no shot "${shotId}"`)
    return saveProject(upsertShot(p, { ...shot, uses }))
  }), [edit])

  const addVersion = useCallback(<K extends IngredientKind>(kind: K, id: string, payload: PayloadOf[K], name?: string) =>
    edit((p) => postVersion(p.id, kind, id, payload, name)), [edit])

  const staleness = useMemo(() => (project ? staleOf(project) : {}), [project])

  return { project, staleness, loading, error, saveShot, addVersion, setUses, refresh }
}
