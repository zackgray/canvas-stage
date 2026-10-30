/**
 * Dev-only Vite middleware for the job runner's own surface (server/jobs/index.ts is the runner itself). Local pages
 * only (server/guard.ts); nothing here submits a job.
 *   GET  /__lab/jobs          -> { cap, spentToday, remaining, balanceCents, creditsBalance, inFlight[], recent[] }
 *   POST /__lab/jobs/recover  { jobId, outputs? } -> fetch the existing job by id and write its outputs (never submits)
 */
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { refuseForeign } from '../guard.ts'
import { balanceCents, redact } from '../stills/ledger.ts'
import { jobRuntime } from './runtime.ts'
import { recoverJob } from './recover.ts'
import { JobError, type OutputTarget } from './types.ts'
import { noComfyTarget } from '../comfy/index.ts'
import { startupLine } from '../comfy/errorHints.ts'
import { ffmpegOk } from '../clay/service.ts'

export interface JobsEnv { COMFY_API_KEY?: string; COMFY_BASE_URL?: string; CANVAS_DAY_BUDGET?: string }

const send = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => { size += c.length; if (size > limit) { reject(new JobError('recover', 'body too large', 413)); req.destroy() } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Recovery targets named by the caller must stay inside the project. */
function targetsUnder(root: string, raw: unknown): Record<string, OutputTarget> | undefined {
  if (raw === undefined) return undefined
  const out: Record<string, OutputTarget> = {}
  for (const [node, t] of Object.entries((raw ?? {}) as Record<string, { dir?: unknown; name?: unknown }>)) {
    if (typeof t?.dir !== 'string' || typeof t?.name !== 'string' || !/^[\w.-]+$/.test(t.name)) throw new JobError('recover', 'bad outputs', 400)
    const dir = path.resolve(root, t.dir)
    if (!dir.startsWith(root + path.sep)) throw new JobError('recover', 'outputs must be inside the project', 400)
    out[node] = { dir, name: t.name }
  }
  return out
}

export function labJobs(env: JobsEnv): Plugin {
  return {
    name: 'lab-jobs',
    apply: 'serve',
    configureServer(server) {
      for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL', 'CANVAS_DAY_BUDGET'] as const) {
        if (env[k] && !process.env[k]) process.env[k] = env[k]
      }
      const root = path.resolve(server.config.root)
      if (!process.env.VITEST) console.log(startupLine({ key: process.env.COMFY_API_KEY, baseUrl: process.env.COMFY_BASE_URL, budget: process.env.CANVAS_DAY_BUDGET, ffmpeg: ffmpegOk(), node: process.versions.node }))
      server.middlewares.use('/__lab/jobs', async (req, res) => {
        const route = new URL(req.url ?? '', 'http://lab').pathname.replace(/\/+$/, '') || '/'
        try {
          const rt = jobRuntime()
          if (route === '/') {
            if (req.method !== 'GET') return send(res, 405, { error: 'GET only' })
            const refused = refuseForeign(req)
            if (refused) return send(res, refused.status, { error: refused.message })
            const cap = rt.budget.cap()
            const spent = rt.budget.spentToday()
            const balance = process.env.COMFY_API_KEY ? await balanceCents() : null
            const all = rt.store.list()
            return send(res, 200, { cap, spentToday: spent, remaining: cap === null ? null : Math.max(0, cap - spent),
              balanceCents: balance, inFlight: rt.store.open(), recent: all.filter((r) => r.status === 'done' || r.status === 'failed').slice(0, 20) })
          }
          if (route === '/recover') {
            if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
            const refused = refuseForeign(req, { json: true })
            if (refused) return send(res, refused.status, { error: refused.message })
            if (!process.env.COMFY_API_KEY && !process.env.COMFY_BASE_URL) return send(res, 503, { error: noComfyTarget() })
            let body: { jobId?: unknown; outputs?: unknown }
            try { body = JSON.parse(await readBody(req)) } catch { return send(res, 400, { error: 'bad JSON' }) }
            if (typeof body.jobId !== 'string') return send(res, 400, { error: 'jobId required' })
            const r = await recoverJob(rt, body.jobId, targetsUnder(root, body.outputs))
            return send(res, 200, r)
          }
          return send(res, 404, { error: 'no such route' })
        } catch (e) {
          if (!res.headersSent) send(res, e instanceof JobError ? e.status : 500, { error: redact(e instanceof Error ? e.message : String(e)) })
        }
      })
    },
  }
}
