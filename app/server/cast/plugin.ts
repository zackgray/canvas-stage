/**
 * Dev-only Vite middleware for Cast ("describe a character -> front candidates -> keep a face").
 * Routes and files: see routes.ts. Local pages only (server/guard.ts); every paid call is a runJob (server/jobs), so
 * the day budget (CANVAS_DAY_BUDGET) and the ledger apply. Sheets are served from public/lab-assets/cast/ by the static
 * route below: the folder is watch-ignored, and Vite's public-file index (kept by that watcher) would 404 a candidate or
 * sheet written after the server started (seen on a cold start, 2026-10-19).
 * The Comfy key lives only in this Node process; nothing here returns or logs it.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { existsSync } from 'node:fs'
import type { Plugin } from 'vite'
import { refuseForeign } from '../guard.ts'
import { jobRuntime } from '../jobs/index.ts'
import { servePng } from '../perform/serve.ts'
import { createCast } from './routes.ts'

export interface CastEnv {
  COMFY_API_KEY?: string
  COMFY_BASE_URL?: string
}

function send(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage, limit = 32 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) { reject(new Error('body too large')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function labCast(env: CastEnv): Plugin {
  return {
    name: 'lab-cast',
    apply: 'serve',
    config: () => ({ server: { watch: { ignored: ['**/public/lab-assets/cast/**'] } } }),
    configureServer(server) {
      for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL'] as const) {
        if (env[k] && !process.env[k]) process.env[k] = env[k]
      }
      const publicDir = server.config.publicDir || path.join(server.config.root, 'public')
      const cast = createCast({ publicDir, rt: () => jobRuntime() })
      const castDir = path.join(publicDir, 'lab-assets', 'cast')
      server.middlewares.use('/lab-assets/cast', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        let rel: string
        try { rel = decodeURIComponent(new URL(req.url ?? '', 'http://lab').pathname).replace(/^\/+/, '') } catch { return next() } // a malformed %
        const file = path.resolve(castDir, rel)
        if (!/^[a-z0-9][a-z0-9-]{0,40}\/(?:(?:draft|v\d{1,4}|earlier)\/[\w-]+\.png|kept\/face-\d+\.(?:png|jpg|webp))$/.test(rel) || !file.startsWith(castDir + path.sep) || !existsSync(file)) return next()
        servePng(req, res, file)
      })
      server.middlewares.use('/__lab/cast', async (req, res) => {
        try {
          const route = new URL(req.url ?? '', 'http://lab').pathname.replace(/^\/+|\/+$/g, '')
          if (req.method === 'POST') {
            const refused = refuseForeign(req, { json: true })
            if (refused) return send(res, refused.status, { error: refused.message })
          }
          let body: Record<string, unknown> = {}
          if (req.method === 'POST') {
            const parsed: unknown = JSON.parse((await readBody(req)).trim() || '{}')
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return send(res, 400, { error: 'body must be a JSON object' })
            body = parsed as Record<string, unknown>
          }
          const r = await cast(req.method ?? 'GET', route, body)
          send(res, r.status, r.body)
        } catch (e) {
          send(res, e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? 'bad JSON' : 'cast failed' })
        }
      })
    },
  }
}
