// The shell's view of the project: a name for the top bar and "is this shot stale" for the shot strip's badge.
// Tolerant of the project being absent and of the staleness shape (a map, a set, a list or a record of shot ids).
import { useProject } from './projectSource'
import type { ProjectHookLike } from './projectTypes'

export interface ShellProject {
  /** false while there is no project (none loaded, or the project store is not wired in) */
  available: boolean
  name: string | null
  loading: boolean
  error: string | null
  /** does any of these ids (a shot, its still or its export folder) need re-rendering? */
  isStale: (...ids: string[]) => boolean
}

const flagged = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v)

/** Is `id` stale in `staleness`? Map / record: a truthy (non-empty list) entry; Set / array: listed (or {shotId}). */
export function staleIn(staleness: unknown, id: string): boolean {
  if (!staleness) return false
  if (staleness instanceof Map) return flagged(staleness.get(id))
  if (staleness instanceof Set) return staleness.has(id)
  if (Array.isArray(staleness)) {
    return staleness.some((x) => x === id || (typeof x === 'object' && x !== null && (x as { shotId?: unknown }).shotId === id))
  }
  if (typeof staleness === 'object') {
    const rec = staleness as Record<string, unknown>
    if (rec.shots !== undefined) return staleIn(rec.shots, id)
    return Object.hasOwn(rec, id) && flagged(rec[id])
  }
  return false
}

export function shellProject(p: ProjectHookLike): ShellProject {
  const proj = p.project as { name?: unknown } | null
  const name = proj && typeof proj.name === 'string' ? proj.name : null
  const error = p.error == null ? null : p.error instanceof Error ? p.error.message : String(p.error)
  return { available: !!proj, name, loading: p.loading, error, isStale: (...ids) => ids.some((id) => staleIn(p.staleness, id)) }
}

export function useShellProject(): ShellProject {
  return shellProject(useProject())
}
