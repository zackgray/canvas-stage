/**
 * The scene library at LIBRARY_ROUTES.scenes (libraryContract.ts): list, create, read, rename, remove from the list, pick the
 * current set, and the scene's paid jobs in flight. Plus `captureJobs` in front of every paid route (jobRecords.ts), which is why
 * this plugin is registered before them in vite.config.ts. Local pages only (server/guard.ts); POSTs are JSON. Free; no Comfy.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { LIBRARY_ROUTES, type SceneSummary } from '../../src/shared/libraryContract.ts'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { checkHung, releaseHung } from '../jobs/hang.ts'
import { jobRuntime } from '../jobs/runtime.ts'
import { listTakes } from '../takes/store.ts'
import { captureJobs, JobRecords } from './jobRecords.ts'
import { LibraryError, SceneLibrary } from './library.ts'
import { viewOf } from './librarySummary.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export interface LibraryCtx { publicDir: string; library: SceneLibrary; jobs: JobRecords }
export function libraryCtx(over: { publicDir?: string; now?: () => Date } = {}): LibraryCtx {
  const publicDir = over.publicDir ?? path.join(APP, 'public')
  return { publicDir, library: new SceneLibrary(publicDir, over.now), jobs: new JobRecords(publicDir, over.now) }
}

export interface Reply { status: number; body: unknown }
const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {})

/** The routes as one pure handler (tests drive it directly). `parts` are the path's segments after /__lab/scenes. */
export async function handleLibrary(ctx: LibraryCtx, method: string, parts: string[], query: URLSearchParams, body: unknown): Promise<Reply> {
  const { library, jobs, publicDir } = ctx
  try {
    const b = obj(body)
    const view = (id: string) => { const d = library.read(id); return d ? { status: 200, body: viewOf(publicDir, d) } : { status: 404, body: { error: 'no such scene' } } }
    if (parts.length === 0) {
      if (method === 'GET') {
        const takes = listTakes(publicDir)
        const all = query.get('hidden') === '1'
        const list: SceneSummary[] = library.all().filter((d) => all || !d.hidden).map((d) => viewOf(publicDir, d, takes).summary)
        return { status: 200, body: list.sort((x, y) => y.lastEdited.localeCompare(x.lastEdited) || y.id.localeCompare(x.id)) }
      }
      if (method === 'POST') { const d = await library.create(b.name); return { status: 201, body: viewOf(publicDir, d) } }
      return { status: 405, body: { error: 'method not allowed' } }
    }
    const [id, sub, jobId, act, ...rest] = parts
    library.file(id) // 400 for a bad id
    if (rest.length) return { status: 404, body: { error: 'no such route' } }
    if (sub === undefined) return method === 'GET' ? view(id) : { status: 405, body: { error: 'GET only' } }
    if (sub === 'jobs') {
      if (!library.read(id)) return { status: 404, body: { error: 'no such scene' } }
      if (jobId === undefined) return method === 'GET' ? { status: 200, body: { jobs: jobs.list(id) } } : { status: 405, body: { error: 'GET only' } }
      if (act === undefined && method === 'GET') { const r = jobs.read(id, jobId); return r ? { status: 200, body: r } : { status: 404, body: { error: 'no such job' } } }
      if (act === 'clear' && method === 'POST') return { status: 200, body: jobs.clear(id, jobId) }
      if (act === 'release' && method === 'POST') return releaseHung(jobs, id, jobId)
      if (act === 'check' && method === 'POST') return checkHung(jobs, jobRuntime(), id, jobId)
      return { status: 404, body: { error: 'no such route' } }
    }
    if (method !== 'POST' || jobId !== undefined) return { status: 404, body: { error: 'no such route' } }
    if (sub === 'rename') return { status: 200, body: viewOf(publicDir, await library.rename(id, b.name, b.revision)) }
    if (sub === 'remove') return { status: 200, body: viewOf(publicDir, await library.remove(id, b.revision)) }
    if (sub === 'world') return { status: 200, body: viewOf(publicDir, await library.setWorld(id, b.worldId, b.revision)) }
    return { status: 404, body: { error: 'no such route' } }
  } catch (e) {
    if (e instanceof LibraryError) return { status: e.status, body: { error: e.message, ...(e.revision !== undefined ? { revision: e.revision } : {}) } }
    if (e instanceof Error && /^bad (scene|job) id$/.test(e.message)) return { status: 400, body: { error: e.message } }
    return { status: 500, body: { error: e instanceof Error ? e.message : String(e) } }
  }
}

export function mountLibrary(app: Connect.Server, ctx: LibraryCtx): void {
  app.use(captureJobs(ctx.jobs))
  app.use(LIBRARY_ROUTES.scenes, async (req, res) => {
    try {
      const refused = refuseForeign(req, { json: req.method === 'POST' })
      if (refused) return send(res, refused.status, { error: refused.message })
      const url = new URL(req.url ?? '/', 'http://local')
      let body: unknown = null
      if (req.method === 'POST') {
        try { body = JSON.parse((await readBody(req, 16 * 1024)) || '{}') } catch (e) {
          const status = (e as { status?: number }).status ?? 400
          return send(res, status, { error: status === 413 ? 'body too large' : 'bad JSON' })
        }
      }
      let parts: string[]
      try { parts = url.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s)) } catch { return send(res, 400, { error: 'bad path' }) }
      const out = await handleLibrary(ctx, req.method ?? 'GET', parts, url.searchParams, body)
      send(res, out.status, out.body)
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : String(e) })
    }
  })
}

export function labLibrary(over: { publicDir?: string; now?: () => Date } = {}): Plugin {
  const ctx = libraryCtx(over)
  return { name: 'lab-library', apply: 'serve', configureServer(server) { mountLibrary(server.middlewares, ctx) } }
}
