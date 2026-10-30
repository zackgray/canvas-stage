/**
 * The "Edit this frame" endpoint: POST /__lab/frame-edit {takeId, stillId, prompt, seed?} -> { still } — one paid Qwen-Image-Edit
 * job, a NEW unapproved version of the take's first frame (run.ts). Local pages only (server/guard.ts); the Comfy key never leaves
 * this process. The press is recorded as a scene job like every paid press (libraryContract JOB_ROUTES frameEdit); the route runs
 * under the hero section's exclusive key, so an edit waits behind — and never overlaps — a draw, a render or another edit.
 *   400 bad_request (body, prompt), 404 not_found (take, still), 409 busy / stale, 429 budget, 503 no_target / no_budget, 422 bad_output
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { BusyError, JobError, jobRuntime } from '../jobs/index.ts'
import { redact } from '../stills/ledger.ts'
import { noComfyTarget } from '../comfy/index.ts'
import { HeroHttpError } from '../hero/store.ts'
import { FRAME_EDIT_ROUTE, type FrameEditResponse } from './spec.ts'
import { parseFrameEditRequest, runFrameEdit, type FrameEditDeps } from './run.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const STATUS_CODE: Record<number, string> = { 400: 'bad_request', 404: 'not_found', 409: 'busy', 429: 'budget', 422: 'bad_output' }

export interface FrameEditEnv { COMFY_API_KEY?: string; COMFY_BASE_URL?: string }
export interface FrameEditOverrides { deps?: Partial<FrameEditDeps> }

function codeOf(e: unknown, status: number): string | undefined {
  if (e instanceof HeroHttpError) return e.code
  if (e instanceof JobError) return status === 503 ? (/CANVAS_DAY_BUDGET/.test(e.message) ? 'no_budget' : 'no_target') : STATUS_CODE[status]
  return STATUS_CODE[status] ?? (status === 503 ? 'no_target' : undefined)
}

export function labFrameEdit(env: FrameEditEnv = {}, over: FrameEditOverrides = {}): Plugin {
  return {
    name: 'lab-frame-edit',
    apply: 'serve',
    configureServer(server) {
      for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL'] as const) if (env[k] && !process.env[k]) process.env[k] = env[k]
      const publicDir = server.config?.publicDir || path.join(server.config?.root || APP, 'public')
      const ctx = { publicDir, deps: { runtime: jobRuntime, ...over.deps } }
      const configured = () => !!(process.env.COMFY_API_KEY || process.env.COMFY_BASE_URL)

      server.middlewares.use(FRAME_EDIT_ROUTE, async (req, res) => {
        const fail = (e: unknown) => {
          const status = (e as { status?: number }).status ?? 500
          send(res, status, {
            error: redact(e instanceof Error ? e.message : String(e)), ...(codeOf(e, status) ? { code: codeOf(e, status) } : {}),
            ...(e instanceof BusyError ? { running: e.running } : {}), ...(e instanceof JobError && e.jobId ? { jobId: e.jobId } : {}),
          })
        }
        try {
          const url = new URL(req.url ?? '', 'http://lab')
          const route = url.pathname.replace(/\/+$/, '') || '/'
          if (req.method !== 'POST' || route !== '/') return send(res, 404, { error: 'no such route', code: 'not_found' })
          const refused = refuseForeign(req, { json: true })
          if (refused) return send(res, refused.status, { error: refused.message })
          if (!configured()) throw Object.assign(new Error(noComfyTarget()), { status: 503, code: 'no_target' })
          let body: unknown
          try { body = JSON.parse(await readBody(req)) } catch { throw new HeroHttpError(400, 'body must be JSON', 'bad_request') }
          const { still } = await runFrameEdit(ctx, parseFrameEditRequest(body))
          return send(res, 200, { still } satisfies FrameEditResponse)
        } catch (e) {
          if (!res.headersSent) fail(e)
        }
      })
    },
  }
}
