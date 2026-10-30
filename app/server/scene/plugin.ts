/**
 * Scene's design routes at SCENE_ROUTES.scene (sceneContract.ts): concept candidates (paid, concepts.ts), the draft design, uploads
 * and the move into a Bible (free, draft.ts); plus static serving of public/lab-assets/scene/, which is watch-ignored (a draft
 * save must never reload the page, and Vite's public index would miss files written after startup). Local pages only
 * (server/guard.ts): JSON POSTs need application/json, an upload an image content-type, so a foreign page cannot send either
 * without a preflight these routes never grant. The Comfy key lives only in this Node process.
 */
import { createReadStream, existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { SCENE_ROUTES, UPLOAD_LIMIT, UPLOAD_TYPES } from '../../src/shared/sceneContract.ts'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { jobRuntime, type JobRuntime } from '../jobs/index.ts'
import { handleConcepts, type ConceptCtx } from './concepts.ts'
import { DraftError, DraftStore } from './draft.ts'
import { SceneLibrary } from './library.ts'
import { briefFingerprint } from './librarySummary.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const IMAGE_TYPES: string[] = Object.values(UPLOAD_TYPES)
const STATIC_TYPE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

export interface SceneEnv { COMFY_API_KEY?: string; COMFY_BASE_URL?: string }
export interface SceneOverrides { publicDir?: string; now?: () => Date; seed?: () => number; runtime?: () => JobRuntime; configured?: () => boolean }
export interface SceneCtx { concepts: ConceptCtx; drafts: DraftStore; library: SceneLibrary }

export function sceneCtx(env: SceneEnv = {}, over: SceneOverrides = {}): SceneCtx {
  const publicDir = over.publicDir ?? path.join(APP, 'public')
  return {
    concepts: { publicDir, runtime: over.runtime ?? jobRuntime, now: over.now, seed: over.seed,
      configured: over.configured ?? (() => !!(process.env.COMFY_API_KEY || process.env.COMFY_BASE_URL || env.COMFY_API_KEY || env.COMFY_BASE_URL)) },
    drafts: new DraftStore(publicDir, over.now),
    library: new SceneLibrary(publicDir, over.now),
  }
}

function readRaw(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) { reject(new DraftError(413, `the image is larger than ${limit / 1024 / 1024} MB`)); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export interface Reply { status: number; body: unknown }
/** The JSON and upload routes as one pure handler (tests drive it directly). `raw` is an upload's body. */
export async function handleScene(ctx: SceneCtx, method: string, sub: string, query: URLSearchParams, body: unknown, raw?: Buffer): Promise<Reply> {
  try {
    if (sub === '/concepts' || sub.startsWith('/concepts/')) return await handleConcepts(ctx.concepts, method, sub.slice('/concepts'.length), query, body)
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    if (sub === '/draft' && method === 'GET') return { status: 200, body: { draft: ctx.drafts.get(query.get('project') ?? '') } }
    if (method !== 'POST') return { status: 405, body: { error: 'method not allowed' } }
    if (sub === '/draft') return { status: 200, body: { draft: await ctx.drafts.save(b.project, b.design, b.revision) } }
    if (sub === '/draft/migrate') {
      const out = await ctx.drafts.migrate(b.project, b.worldId)
      // the brief the set is built from, kept with the scene's world: Scene can then say when the brief has moved on (M4)
      const draft = ctx.drafts.get(b.project)
      if (draft) await ctx.library.markBuilt(b.project, out.worldId, briefFingerprint(draft.design)).catch(() => null)
      return { status: 200, body: out }
    }
    if (sub === '/upload') return { status: 200, body: await ctx.drafts.upload(query.get('project') ?? '', raw ?? Buffer.alloc(0)) }
    return { status: 404, body: { error: 'no such route' } }
  } catch (e) {
    if (e instanceof DraftError) return { status: e.status, body: { error: e.message, ...(e.revision !== undefined ? { revision: e.revision } : {}) } }
    return { status: 500, body: { error: e instanceof Error ? e.message : String(e) } }
  }
}

export function mountScene(app: Connect.Server, ctx: SceneCtx): void {
  const assets = path.join(ctx.concepts.publicDir, 'lab-assets', 'scene')
  app.use('/lab-assets/scene', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    let rel: string
    try { rel = decodeURIComponent(new URL(req.url ?? '', 'http://lab').pathname).replace(/^\/+/, '') } catch { return next() } // a malformed % (m11)
    const m = /^[A-Za-z0-9][\w-]{0,63}\/(?:draft\/refs|concepts\/c-\d{14}-[a-z0-9]{4})\/[\w-]+\.(png|jpg|webp)$/.exec(rel)
    const file = path.resolve(assets, rel)
    if (!m || !file.startsWith(assets + path.sep) || !existsSync(file)) return next()
    res.setHeader('content-type', STATIC_TYPE[m[1]])
    res.setHeader('cache-control', 'no-cache')
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).on('error', () => { res.statusCode = 500; res.end() }).pipe(res)
  })
  app.use(SCENE_ROUTES.scene, async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', 'http://local')
      const sub = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
      const upload = req.method === 'POST' && sub === '/upload'
      const refused = refuseForeign(req, { json: req.method === 'POST' && !upload })
      if (refused) return send(res, refused.status, { error: refused.message })
      let body: unknown = null, raw: Buffer | undefined
      if (upload) {
        const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
        if (!IMAGE_TYPES.includes(type)) return send(res, 415, { error: 'only PNG, JPEG or WebP images can be uploaded' })
        const len = Number(req.headers['content-length'] ?? 0)
        if (len > UPLOAD_LIMIT) return send(res, 413, { error: `the image is larger than ${UPLOAD_LIMIT / 1024 / 1024} MB` })
        raw = await readRaw(req, UPLOAD_LIMIT)
      } else if (req.method === 'POST') {
        try { body = JSON.parse((await readBody(req, 600 * 1024)) || '{}') } catch (e) {
          const status = (e as { status?: number }).status ?? 400
          return send(res, status, { error: status === 413 ? 'body too large' : 'bad JSON' })
        }
      }
      const out = await handleScene(ctx, req.method ?? 'GET', sub, url.searchParams, body, raw)
      send(res, out.status, out.body)
    } catch (e) {
      send(res, (e as { status?: number }).status ?? 500, { error: e instanceof Error ? e.message : String(e) })
    }
  })
}

export function labScene(env: SceneEnv = {}, over: SceneOverrides = {}): Plugin {
  const ctx = sceneCtx(env, over)
  return {
    name: 'lab-scene',
    apply: 'serve',
    config: () => ({ server: { watch: { ignored: ['**/public/lab-assets/scene/**'] } } }),
    configureServer(server) {
      for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL'] as const) if (env[k] && !process.env[k]) process.env[k] = env[k]
      mountScene(server.middlewares, ctx)
    },
  }
}
