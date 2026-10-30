/**
 * Generated set pieces at /__lab/pieces (recipe wave, Track D). Local pages only (server/guard.ts).
 *   GET  /?world=loc-…                 -> PiecesResponse: the price, each approved prop tile's state, the build running, setChangedAt
 *   POST /build    { world, tag }      -> PieceRecord (PAID, one TRELLIS.2 job, PIECE_CR on the button; run.ts for every refusal)
 *   POST /complete { world, tag, run } -> PieceRecord (free: a recovered mesh gets its massing and goes into the plan)
 *   POST /massing-frame?take=&frame=&kind=final|zdepth   PNG body -> { ok } (free: one frame of the take's massing clay)
 *   GET  /massing?take=take-…          -> MassingClay | 404
 * The massing video is encoded by the clay finish, beside clay.mp4 (server/clay/service.ts); the tidy wave dropped its own route.
 * A billed build that never landed: POST /__lab/jobs/recover { jobId } (free), then /complete. Nothing here resubmits.
 */
import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { BusyError, JobError, jobRuntime, running } from '../jobs/index.ts'
import { runPython } from '../l2r/finish.ts'
import { legacyPythonValue, pythonPath } from '../python.ts'
import { logPythonGaps } from '../pythonCheck.ts'
import { redact } from '../stills/ledger.ts'
import { FILES, KitError, KitStore } from '../stage3d/store.ts'
import { readMassingClay, uploadMassingFrame } from './massingClay.ts'
import { buildingOf, buildPiece, completePiece, type PiecesCtx } from './run.ts'
import { isPieceLabel, PIECE_CR, PIECES_KEY, PIECES_ROUTE, type PiecesResponse } from './spec.ts'
import { PieceStore } from './store.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export interface PiecesEnv { COMFY_API_KEY?: string; COMFY_BASE_URL?: string; LIFT_PYTHON?: string }

/** GET: every approved prop tile of the world's scene with its state */
export function piecesStatus(ctx: Pick<PiecesCtx, 'publicDir' | 'runtime'>, world: string): PiecesResponse {
  const store = new PieceStore(ctx.publicDir), id = store.world(world)
  const kits = new KitStore(ctx.publicDir)
  kits.read(id)
  const jobs = ctx.runtime().store
  const r = running(PIECES_KEY, jobs, isPieceLabel)
  const list = jobs.list()
  const changed = kits.setChangedAt(id)
  let stillStale = false
  if (changed) try { stillStale = statSync(path.join(kits.dir(id), FILES.still)).mtimeMs < Date.parse(changed) } catch { /* no still yet */ }
  return {
    price: PIECE_CR, running: r ? { since: r.since, what: r.what } : null, setChangedAt: changed, stillStale,
    tiles: store.tiles(id).tiles.map((t) => store.state(id, t, list, buildingOf(id))),
  }
}

export function labPieces(env: PiecesEnv = {}, over: Partial<PiecesCtx> = {}): Plugin {
  return {
    name: 'lab-pieces',
    apply: 'serve',
    configureServer(server) {
      for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL'] as const) if (env[k] && !process.env[k]) process.env[k] = env[k]
      const cfg = server.config ?? {}
      const publicDir = cfg.publicDir || path.join(cfg.root || APP, 'public')
      // the same one Python as the finish (CANVAS_PYTHON, LIFT_PYTHON the older name); the massing script also needs trimesh, scipy, scikit-image
      const lift = legacyPythonValue(env.LIFT_PYTHON, cfg)
      logPythonGaps(pythonPath(lift), cfg.root || APP)
      const ctx: PiecesCtx = {
        publicDir, runtime: jobRuntime, configured: () => !!(process.env.COMFY_API_KEY || process.env.COMFY_BASE_URL),
        massing: { appDir: cfg.root || APP, python: () => pythonPath(lift), run: runPython }, ...over,
      }
      server.middlewares.use(PIECES_ROUTE, (req, res) => {
        void (async () => {
          const url = new URL(req.url ?? '/', 'http://lab')
          const route = url.pathname.replace(/\/+$/, '') || '/'
          try {
            if (req.method === 'GET' && route === '/') return send(res, 200, piecesStatus(ctx, url.searchParams.get('world') ?? ''))
            if (req.method === 'GET' && route === '/massing') {
              const m = readMassingClay(publicDir, url.searchParams.get('take') ?? '')
              return m ? send(res, 200, m) : send(res, 404, { error: 'no massing clay for this take' })
            }
            if (req.method !== 'POST') return send(res, 404, { error: 'no such route' })
            const refused = refuseForeign(req, { json: route !== '/massing-frame' })
            if (refused) return send(res, refused.status, { error: refused.message })
            if (route === '/massing-frame') {
              const bad = await uploadMassingFrame(publicDir, req, res, url.searchParams)
              if (bad) { req.resume(); send(res, bad[0], { error: bad[1] }) }
              return
            }
            const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>
            if (route === '/build') return send(res, 200, await buildPiece(ctx, body))
            if (route === '/complete') return send(res, 200, await completePiece(ctx, body))
            return send(res, 404, { error: 'no such route' })
          } catch (e) {
            if (res.headersSent) return
            const x = e as { status?: unknown }
            const status = e instanceof SyntaxError ? 400 : typeof x.status === 'number' && x.status >= 400 && x.status < 600 ? x.status : 500
            send(res, status, {
              error: redact(e instanceof SyntaxError ? 'body must be JSON' : e instanceof Error ? e.message : String(e)),
              ...(e instanceof BusyError ? { running: e.running } : {}), ...(e instanceof JobError && e.jobId ? { jobId: e.jobId } : {}),
              ...(e instanceof KitError && e.errors.length ? { errors: e.errors } : {}),
            })
          }
        })()
      })
    },
  }
}
