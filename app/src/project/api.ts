// Browser side of the project endpoint (dev-only middleware, server/project/plugin.ts). Local and free: nothing here
// spends. `fetch` is injectable for tests. A 409 surfaces as a StaleRevisionError carrying the stored revision.
import type { IngredientKind, PayloadOf, Project } from './model.ts'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>
const URL_ = '/__lab/project'
const JSON_POST = { method: 'POST', headers: { 'content-type': 'application/json' } } as const

export class StaleRevisionError extends Error {
  readonly revision: number | undefined
  constructor(message: string, revision: number | undefined) {
    super(message)
    this.revision = revision
  }
}

async function body<T>(res: Response): Promise<T> {
  const b = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & { error?: string; revision?: number }
  if (res.status === 409) throw new StaleRevisionError(b.error ?? 'stale revision', b.revision)
  if (!res.ok) throw new Error(b.error ?? `HTTP ${res.status}`)
  return b
}

const at = (id: string) => `${URL_}/${encodeURIComponent(id)}`

/** The project, or null when it does not exist yet. */
export async function getProject(id: string, f: Fetch = fetch): Promise<Project | null> {
  const res = await f(at(id), { cache: 'no-store' })
  return res.status === 404 ? null : body<Project>(res)
}

export const bootstrapProject = async (f: Fetch = fetch) =>
  body<{ project: Project; created: boolean }>(await f(`${URL_}/bootstrap`, { ...JSON_POST, body: '{}' }))

/** Saves the whole document; `p.revision` must be the one it was loaded at. Returns the saved copy (revision + 1). */
export const saveProject = async (p: Project, f: Fetch = fetch) =>
  body<Project>(await f(at(p.id), { ...JSON_POST, body: JSON.stringify(p) }))

export const postVersion = async <K extends IngredientKind>(id: string, kind: K, ingredient: string, payload: PayloadOf[K], name?: string, f: Fetch = fetch) =>
  body<Project>(await f(`${at(id)}/ingredient`, { ...JSON_POST, body: JSON.stringify({ kind, id: ingredient, payload, ...(name ? { name } : {}) }) }))
