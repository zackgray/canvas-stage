/**
 * Clay layout export of a locked take (docs/wave-b-contract.md, T1), at ROUTES.clay. Free and local. Local pages only
 * (server/guard.ts); the binary uploads are checked for origin only, finish is JSON.
 *   POST /__lab/clay/depth?take=&frame=&kind=colour|depth|bg|final   one pass of one frame, streamed (upload.ts; 64 MB cap)
 *   POST /__lab/clay/finish   ClayFinishRequest -> 202 ClayResponse (status running; service.ts runs scripts/clay/clay.py);
 *                             409 while any clay is shading, 400 for missing frames / bad cameras, 503 with no ffmpeg / Python / face model;
 *                             a kit world's take: its final frames encoded by ffmpeg alone (kit.ts), no Python
 *   GET  /__lab/clay?take=    -> ClayResponse (+ busyWith); clay null before the first finish, 404 for a take not locked
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv, type Plugin } from 'vite'
import { legacyPythonValue } from '../python.ts'
import { ROUTES } from '../../src/shared/shotContract.ts'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { forgetMassing } from '../pieces/modelClay.ts'
import type { ClayRunnerOpts } from './runner.ts'
import { ClayService } from './service.ts'
import { streamUpload, uploadTarget } from './upload.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export interface ClayEnv { LIFT_PYTHON?: string; CLAY_YUNET?: string; CLAY_KEEP_FRAMES?: string }
export interface ClayOverrides {
  publicDir?: string
  hasFfmpeg?: () => boolean
  runner?: Partial<ClayRunnerOpts>
  /** upload cap (tests) */
  uploadLimit?: number
  /** kit clay: the encoded video's frame count (tests) */
  probeFrames?: (file: string) => Promise<number>
}

export function labClay(env: ClayEnv = {}, over: ClayOverrides = {}): Plugin {
  let pythonEnv = env.LIFT_PYTHON
  let keepEnv = env.CLAY_KEEP_FRAMES
  const publicDir = over.publicDir ?? path.join(APP, 'public')
  const svc = new ClayService({
    publicDir, appDir: APP, python: () => pythonEnv, // server/python.ts: CANVAS_PYTHON first, then this, then the environment's
    yunet: env.CLAY_YUNET ?? process.env.CLAY_YUNET, hasFfmpeg: over.hasFfmpeg, probeFrames: over.probeFrames,
    runner: { keepFrames: () => (keepEnv ?? process.env.CLAY_KEEP_FRAMES) === '1', ...over.runner },
  })
  return {
    name: 'lab-clay',
    apply: 'serve',
    configureServer(server) {
      pythonEnv = legacyPythonValue(pythonEnv, server.config ?? {})
      if (keepEnv === undefined && server.config?.mode) keepEnv = loadEnv(server.config.mode, server.config.envDir || APP, 'CLAY_').CLAY_KEEP_FRAMES
      server.httpServer?.once('close', () => svc.runner.stop())
      server.middlewares.use(ROUTES.clay, async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x')
        try {
          if (req.method === 'POST') {
            const refused = refuseForeign(req, { json: url.pathname === '/finish' })
            if (refused) return send(res, refused.status, { error: refused.message })
          }
          if (req.method === 'POST' && url.pathname === '/depth') {
            const t = uploadTarget(publicDir, url.searchParams)
            if (Array.isArray(t)) { req.resume(); return send(res, t[0], { error: t[1] }) }
            if (svc.runner.busyWith === t.take) { req.resume(); return send(res, 409, { error: 'this take\'s clay is shading now; wait for it to finish' }) }
            // a new export of this take begins with its first frame: the last export's massing clay is no longer the set (modelClay.ts)
            if (t.kind === 'final' && t.frame === 0) forgetMassing(publicDir, t.take)
            return await streamUpload(req, res, t, over.uploadLimit)
          }
          if (req.method === 'POST' && url.pathname === '/finish') {
            let raw: unknown
            try { raw = JSON.parse(await readBody(req, 256 * 1024)) } catch (e) {
              const err = e as Error & { status?: number }
              return send(res, err.status ?? 400, { error: err.status ? err.message : 'body must be JSON' })
            }
            const r = svc.finish(raw)
            return send(res, r.code, r.body)
          }
          if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
            const r = svc.status(url.searchParams.get('take'))
            return send(res, r.code, r.body)
          }
          return send(res, 404, { error: 'not found' })
        } catch (e) {
          if (!res.headersSent) send(res, 500, { error: (e as Error).message })
        }
      })
    },
  }
}
