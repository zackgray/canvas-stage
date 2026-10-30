// Browser side of the scene library (server/scene/libraryPlugin.ts, libraryContract.ts). Free: nothing here spends. `fetch` is
// injectable for tests. A 409 is a StaleSceneError: the scene changed in another tab, and the page says so with a Reload.
import {
  LIBRARY_ROUTES, type SceneJobRecord, type SceneSummary, type SceneView,
} from '../shared/libraryContract'

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** what a stale write tells the owner (m7): never a silent overwrite */
export const STALE_SCENE = 'This scene was changed in another tab or window, so your last change was not saved. Reload to see the newest version.'

export class StaleSceneError extends Error {
  readonly revision: number | undefined
  constructor(message = STALE_SCENE, revision?: number) { super(message); this.revision = revision }
}

export async function libraryReply<T>(res: Response): Promise<T> {
  const b = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & { error?: string; revision?: number }
  if (res.status === 409 && typeof b.revision === 'number') throw new StaleSceneError(STALE_SCENE, b.revision)
  if (!res.ok) throw new Error(b.error ?? `HTTP ${res.status}`)
  return b
}

const R = LIBRARY_ROUTES.scenes
const at = (id: string, ...rest: string[]) => [R, encodeURIComponent(id), ...rest.map(encodeURIComponent)].join('/')
const post = (f: Fetch, url: string, body: unknown) => f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export interface LibraryApi {
  /** the Resume list: last edited first; hidden scenes only with `hidden` */
  list: (o?: { hidden?: boolean }) => Promise<SceneSummary[]>
  get: (id: string) => Promise<SceneView | null>
  create: (name?: string) => Promise<SceneView>
  rename: (id: string, name: string, revision: number) => Promise<SceneView>
  /** "Remove from list": hidden, never deleted */
  remove: (id: string, revision: number) => Promise<SceneView>
  /** one of the scene's own worlds becomes its current set */
  setWorld: (id: string, worldId: string, revision: number) => Promise<SceneView>
  jobs: (id: string) => Promise<SceneJobRecord[]>
  /** claims a finished job's result (true for the first caller only) */
  clearJob: (id: string, jobId: string) => Promise<boolean>
}

export function libraryApi(f: Fetch = (i, init) => fetch(i, init)): LibraryApi {
  return {
    list: async (o) => libraryReply<SceneSummary[]>(await f(o?.hidden ? `${R}?hidden=1` : R, { cache: 'no-store' })),
    get: async (id) => { const res = await f(at(id), { cache: 'no-store' }); return res.status === 404 ? null : libraryReply<SceneView>(res) },
    create: async (name) => libraryReply<SceneView>(await post(f, R, name ? { name } : {})),
    rename: async (id, name, revision) => libraryReply<SceneView>(await post(f, at(id, 'rename'), { name, revision })),
    remove: async (id, revision) => libraryReply<SceneView>(await post(f, at(id, 'remove'), { revision })),
    setWorld: async (id, worldId, revision) => libraryReply<SceneView>(await post(f, at(id, 'world'), { worldId, revision })),
    jobs: async (id) => (await libraryReply<{ jobs: SceneJobRecord[] }>(await f(at(id, 'jobs'), { cache: 'no-store' }))).jobs,
    clearJob: async (id, jobId) => (await libraryReply<{ cleared: boolean }>(await post(f, at(id, 'jobs', jobId, 'clear'), {}))).cleared,
  }
}
