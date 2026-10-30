/**
 * Dev-only Vite middleware for the project model (t24, src/project/model.ts). Local and free: no Cloud job here.
 * Every POST answers local pages only and takes application/json (server/guard.ts).
 *   GET  /__lab/project                  -> ProjectSummary[]
 *   POST /__lab/project/bootstrap        -> {project, created} the default project from today's files (bootstrap.ts);
 *                                           idempotent: an existing one is returned untouched
 *   GET  /__lab/project/:id              -> Project (404 when absent)
 *   POST /__lab/project/:id              Project -> Project (whole document; its revision must be the stored one,
 *                                           else 409 {"error", "revision"}; the saved copy carries revision + 1)
 *   POST /__lab/project/:id/ingredient   AddVersionRequest -> Project (appends a version, or creates the ingredient)
 *        400 bad id / shape / invariant · 413 body past PROJECT_LIMIT · 415 not JSON · 403 foreign page
 * Files: public/lab-assets/projects/<id>/project.json (gitignored, watch-ignored so a save never reloads the page).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { addVersion, DEFAULT_PROJECT, PROJECT_ID_RE, type PayloadOf } from '../../src/project/model.ts'
import { parseAddVersion, parseProject, ProjectShapeError } from '../../src/project/parse.ts'
import { refuseForeign } from '../guard.ts'
import { buildDefaultProject } from './bootstrap.ts'
import { httpError, ProjectStore } from './store.ts'

/** Largest project document accepted: a few hundred shots with their records are well under 1 MB. */
export const PROJECT_LIMIT = 2 * 1024 * 1024

function send(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBytes(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) { reject(httpError(413, 'body too large')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** The route's segments, each decoded on its own and not normalised: "..", "%2e%2e" and "%2F" reach the id check. */
function segments(url: string | undefined): string[] {
  const raw = (url ?? '').split('?')[0].split('/')
  const kept = raw.filter((s, i) => s !== '' || (i > 0 && i < raw.length - 1))
  try { return kept.map((s) => decodeURIComponent(s)) } catch { throw httpError(400, 'bad path') }
}

export function labProject(opts: { now?: () => string } = {}): Plugin {
  const now = opts.now ?? (() => new Date().toISOString())
  return {
    name: 'lab-project',
    apply: 'serve',
    config: () => ({ server: { watch: { ignored: ['**/public/lab-assets/projects/**'] } } }),
    configureServer(server) {
      const root = server.config.root
      const publicDir = server.config.publicDir || path.join(root, 'public')
      const store = new ProjectStore(publicDir)

      server.middlewares.use('/__lab/project', async (req, res) => {
        const fail = (e: unknown) => {
          const status = e instanceof ProjectShapeError ? 400 : e instanceof SyntaxError ? 400 : ((e as { status?: number }).status ?? 500)
          const revision = (e as { revision?: number }).revision
          send(res, status, { error: e instanceof Error ? e.message : String(e), ...(revision !== undefined ? { revision } : {}) })
        }
        const body = async () => {
          if (Number(req.headers['content-length'] ?? 0) > PROJECT_LIMIT) throw httpError(413, 'body too large')
          const text = (await readBytes(req, PROJECT_LIMIT)).toString('utf8')
          return (text.trim() === '' ? null : JSON.parse(text)) as unknown
        }
        try {
          const seg = segments(req.url)
          if (seg.length === 0) {
            if (req.method !== 'GET') return send(res, 405, { error: 'GET only' })
            return send(res, 200, await store.list())
          }
          const [id, sub, ...rest] = seg
          if (id !== 'bootstrap' && !PROJECT_ID_RE.test(id)) return send(res, 400, { error: 'bad project id' })
          if (rest.length || (sub !== undefined && sub !== 'ingredient')) return send(res, 404, { error: 'no such route' })
          if (req.method === 'GET' && id !== 'bootstrap' && sub === undefined) {
            const p = await store.read(id)
            return p ? send(res, 200, p) : send(res, 404, { error: 'no such project' })
          }
          if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
          const refused = refuseForeign(req, { json: true })
          if (refused) return send(res, refused.status, { error: refused.message })
          if (id === 'bootstrap') {
            if (sub !== undefined) return send(res, 404, { error: 'no such route' })
            await body() // drained and size-checked; nothing in it is used
            return send(res, 200, await store.createIfAbsent(DEFAULT_PROJECT, () => buildDefaultProject(publicDir, now())))
          }
          if (sub === 'ingredient') {
            const r = parseAddVersion(await body())
            return send(res, 200, await store.update(id, (p) => {
              if (r.revision !== undefined && r.revision !== p.revision) {
                throw Object.assign(httpError(409, `stale revision ${r.revision}: the project is at ${p.revision}`), { revision: p.revision })
              }
              return addVersion(p, r.kind, r.id, r.payload as PayloadOf[typeof r.kind], now(), r.name)
            }))
          }
          const doc = parseProject(await body())
          if (doc.id !== id) return send(res, 400, { error: 'project id does not match the URL' })
          return send(res, 200, await store.save(doc))
        } catch (e) {
          if (!res.headersSent) fail(e)
        }
      })
    },
  }
}
