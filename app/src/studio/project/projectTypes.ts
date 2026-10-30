/** What the shell reads of useProject() (src/project, the project store); the real hook's result is assignable to it. */
export interface ProjectHookLike {
  project: unknown
  staleness: unknown
  loading: boolean
  error: unknown
}

/** No project: the store is not wired in, or nothing is loaded. */
export const NO_PROJECT: ProjectHookLike = { project: null, staleness: null, loading: false, error: null }
