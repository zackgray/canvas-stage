/**
 * The scene Bible store at BIBLE_ROUTES.bible (bibleContract.ts): free reads and edits (prompt, lines, elements, approve),
 * versions append-only. The paid master draw is track B's depth-locked Qwen graph (masterDraw.ts), injected as `drawMaster`;
 * it needs a Comfy target (503 without one).
 * POSTs are refused from foreign pages first. Local pages only (server/guard.ts).
 * S2: the scene planner and "Develop with AI" (server/planner/, PLANNER_ROUTES) are mounted here too, on the same Comfy env.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { BIBLE_ROUTES } from '../../src/shared/bibleContract.ts'
import { send, readBody } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { jobRuntime } from '../jobs/index.ts'
import { mountPlanner, plannerCtx } from '../planner/plugin.ts'
import { masterDrawer, masterRunning } from './masterDraw.ts'
import { completeMasters } from './masterIntents.ts'
import { previewMaster } from './masterPreview.ts'
import { approvableSetKey, currentSetKey } from './setGate.ts'
import { approvedSetKeys } from './setKeys.ts'
import { readSetApproval } from './read.ts'
import { handleBible, type DrawMaster } from './routes.ts'
import { BibleStore } from './store.ts'
import { noComfyTarget } from '../comfy/index.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export interface BibleEnv { COMFY_API_KEY?: string; COMFY_BASE_URL?: string }
export interface BibleOverrides { publicDir?: string; now?: () => Date; drawMaster?: DrawMaster }

export function labBible(_env: BibleEnv = {}, over: BibleOverrides = {}): Plugin {
  const publicDir = over.publicDir ?? path.join(APP, 'public')
  const store = new BibleStore(publicDir, over.now)
  const configured = () => !!(process.env.COMFY_API_KEY || process.env.COMFY_BASE_URL || _env.COMFY_API_KEY || _env.COMFY_BASE_URL)
  const real = masterDrawer({ publicDir, store, runtime: jobRuntime, now: over.now })
  const drawMaster: DrawMaster = over.drawMaster ?? (async (b, r) => {
    if (!configured()) throw Object.assign(new Error(noComfyTarget()), { status: 503 })
    return real(b, r)
  })
  return {
    name: 'lab-bible',
    apply: 'serve',
    configureServer(server) {
      mountPlanner(server.middlewares, plannerCtx(_env, { publicDir: over.publicDir, now: over.now }))
      server.middlewares.use(BIBLE_ROUTES.bible, async (req, res) => {
        try {
          if (req.method === 'POST') {
            const refused = refuseForeign(req, { json: true })
            if (refused) return send(res, refused.status, { error: refused.message })
          }
          const url = new URL(req.url ?? '/', 'http://local')
          let body: unknown = null
          if (req.method === 'POST') {
            try { body = JSON.parse((await readBody(req)) || '{}') } catch (e) {
              const status = (e as { status?: number }).status ?? 400
              return send(res, status, { error: status === 413 ? 'body too large' : 'bad JSON' })
            }
          }
          const sub = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
          const out = await handleBible({ store, drawMaster, running: (world) => masterRunning(jobRuntime(), world), complete: (w) => completeMasters(publicDir, store, jobRuntime().store, w),
            previewMaster: (b, q) => previewMaster(publicDir, store, b, q), setKey: (w) => currentSetKey(publicDir, w), setApproval: (w) => readSetApproval(publicDir, w),
            approvable: (w, k) => approvableSetKey(publicDir, w, k), approvedKeys: (w) => approvedSetKeys(publicDir, w) }, req.method ?? 'GET', sub, url.searchParams, body)
          send(res, out.status, out.body)
        } catch (e) {
          send(res, 500, { error: e instanceof Error ? e.message : String(e) })
        }
      })
    },
  }
}
