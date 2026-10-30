/**
 * Pass candidates (docs/troubleshooting-control-review-fable.md item 3). Free; nothing here submits. Local pages only (server/guard.ts).
 *   GET  /__lab/passes?take=take-…         -> PassListResponse, newest first (a 'running' one a restart orphaned is settled first: settle.ts)
 *   POST /__lab/passes/keep    {id}        -> { candidate } (the applier makes it the approved image; 409 not_candidate / target_changed)
 *   POST /__lab/passes/discard {id}        -> { candidate } (free; only the state changes; a finished candidate, or a failed one that never got a job id)
 *   POST /__lab/passes/recover {id}        -> { candidate } (a running or failed candidate with a job id: fetched by id, never resubmitted)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import type { PassListResponse } from '../../src/shared/passContract.ts'
import { PASS_ROUTE } from '../../src/studio/passes/routes.ts'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { HeroHttpError, takeIdOf } from '../hero/store.ts'
import { redact } from '../stills/ledger.ts'
import { recovererOf } from './registry.ts'
import { settleAll } from './settle.ts'
import { completeCandidate, discardCandidate, failCandidate, findCandidate, keepCandidate, listCandidates } from './store.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export function labPasses(): Plugin {
  return {
    name: 'lab-passes',
    apply: 'serve',
    configureServer(server) {
      const publicDir = server.config?.publicDir || path.join(server.config?.root || APP, 'public')
      server.middlewares.use(PASS_ROUTE, async (req, res) => {
        const url = new URL(req.url ?? '', 'http://lab')
        const route = url.pathname.replace(/\/+$/, '') || '/'
        try {
          if (req.method === 'GET') {
            if (route !== '/') return send(res, 404, { error: 'no such route', code: 'not_found' })
            return send(res, 200, { candidates: await settleAll(publicDir, await listCandidates(publicDir, takeIdOf(url.searchParams.get('take')))) } satisfies PassListResponse)
          }
          if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' })
          if (route !== '/keep' && route !== '/discard' && route !== '/recover') return send(res, 404, { error: 'no such route', code: 'not_found' })
          const refused = refuseForeign(req, { json: true })
          if (refused) return send(res, refused.status, { error: refused.message })
          let body: { id?: unknown }
          try { body = JSON.parse(await readBody(req)) ?? {} } catch (e) { throw (e as { status?: number }).status ? e : new HeroHttpError(400, 'body must be JSON', 'bad_request') }
          const id = String(body.id ?? '')
          if (route === '/keep') return send(res, 200, { candidate: await keepCandidate(publicDir, id) })
          if (route === '/discard') return send(res, 200, { candidate: await discardCandidate(publicDir, id) })
          const c = await findCandidate(publicDir, id)
          if (c.state === 'candidate' || c.state === 'kept' || c.state === 'discarded') return send(res, 200, { candidate: c }) // nothing to recover
          if (!c.jobId) throw new HeroHttpError(409, 'this pass has no job id to recover; run it again', 'no_job')
          const recover = recovererOf(c.pass)
          if (!recover) throw new HeroHttpError(501, `nothing recovers a ${c.pass} pass yet`, 'no_recoverer')
          try { return send(res, 200, { candidate: await completeCandidate(publicDir, c, await recover(c, { publicDir })) }) } catch (e) {
            await failCandidate(publicDir, c, redact(e instanceof Error ? e.message : String(e)))
            throw e
          }
        } catch (e) {
          if (res.headersSent) return
          const err = e as { status?: number; code?: string }
          send(res, err.status ?? 500, { error: redact(e instanceof Error ? e.message : String(e)), ...(err.code ? { code: err.code } : {}) })
        }
      })
    },
  }
}
