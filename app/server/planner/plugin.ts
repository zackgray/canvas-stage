/**
 * The scene planner and "Develop with AI" at PLANNER_ROUTES.planner (bibleContract.ts): Gemma 4 E4B on Comfy Cloud writes a kit
 * plan from a scene sentence, a tagged scene brief from an idea, or one character's description. Paid (~3 cr a call; see
 * gemma.ts). POSTs are refused from foreign pages first; local pages only (server/guard.ts).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { PLANNER_ROUTES } from '../../src/shared/bibleContract.ts'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { jobRuntime, type JobRuntime } from '../jobs/index.ts'
import { DEVELOP_SYSTEM, FLESH_SYSTEM } from './briefPrompt.ts'
import { planSystemPrompt } from './planText.ts'
import { handlePlanner, type RouteCtx } from './routes.ts'
import { PlannerStore } from './store.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export interface PlannerEnv { COMFY_API_KEY?: string; COMFY_BASE_URL?: string }
export interface PlannerOverrides { publicDir?: string; now?: () => Date; seed?: () => number; runtime?: () => JobRuntime; configured?: () => boolean }

export function plannerCtx(env: PlannerEnv = {}, over: PlannerOverrides = {}): RouteCtx {
  return {
    store: new PlannerStore(over.publicDir ?? path.join(APP, 'public')),
    runtime: over.runtime ?? jobRuntime,
    system: (kind) => (kind === 'plan' ? planSystemPrompt() : kind === 'develop' ? DEVELOP_SYSTEM : FLESH_SYSTEM),
    now: over.now ?? (() => new Date()),
    seed: over.seed ?? (() => Math.floor(Math.random() * 2 ** 31)),
    configured: over.configured ?? (() => !!(process.env.COMFY_API_KEY || process.env.COMFY_BASE_URL || env.COMFY_API_KEY || env.COMFY_BASE_URL)),
  }
}

/** Mounts the routes on a connect stack (the Bible plugin calls this: one registration point for Scene's routes). */
export function mountPlanner(app: Connect.Server, ctx: RouteCtx): void {
  app.use(PLANNER_ROUTES.planner, async (req, res) => {
    try {
      const refused = refuseForeign(req, { json: req.method === 'POST' })
      if (refused) return send(res, refused.status, { error: refused.message })
      const url = new URL(req.url ?? '/', 'http://local')
      let body: unknown = null
      if (req.method === 'POST') {
        try { body = JSON.parse((await readBody(req)) || '{}') } catch (e) {
          const status = (e as { status?: number }).status ?? 400
          return send(res, status, { error: status === 413 ? 'body too large' : 'bad JSON' })
        }
      }
      const sub = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
      const out = await handlePlanner(ctx, req.method ?? 'GET', sub, url.searchParams, body)
      send(res, out.status, out.body)
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : String(e) })
    }
  })
}

export function labPlanner(env: PlannerEnv = {}, over: PlannerOverrides = {}): Plugin {
  const ctx = plannerCtx(env, over)
  return { name: 'lab-planner', apply: 'serve', configureServer(server) { mountPlanner(server.middlewares, ctx) } }
}
