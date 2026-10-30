/**
 * Locked takes (docs/wave-b-contract.md, T1), at ROUTES.takes. Local pages only (server/guard.ts); POSTs are JSON.
 *   GET  /__lab/takes         -> TakesListResponse (every shots/<id>/take.json, newest lock first)
 *   POST /__lab/takes/lock    TakeLockRequest -> TakeLockResponse (the server stamps id, startKey and dates; an identical take
 *                             already locked comes back as it is, `reused: true`; 400 for a take it cannot use). An optional
 *                             `frame0Key` (carryContract.ts) is kept on the record; a new take whose frame 0 equals an earlier
 *                             one's inherits that take's approved opening still (hero/carry.ts), said as `carried`
 *   POST /__lab/takes/discard {takeId} -> {id, kept}: the take leaves every list; its folder moves to shots/_discarded/ (nothing paid is deleted); 404 if unknown;
 *                             409 while a paid still or render of the take runs (its result is written into that folder)
 *   GET /board, GET /sources, POST /words, POST /rename: the Stage's take list (wordsRoutes.ts). A new lock copies the words of the
 *                             take before it (optional `wordsFrom`, else the world's newest take), else the scene prompt, in as
 *                             the take's own words (store.ts, takeWordsContract.ts)
 *   Each take keeps its own performance (takePerf.ts): the lock body's optional `perf` (TakeLockPerf) is stored as take.json `perf`
 *                             when it hashes to the packId (409 when it does not); none sent = the scene's performance.json when it
 *                             does. The list GET first copies each scene's walk into the takes locked on it that hold none (adopt.ts)
 *   Each take keeps its own set (takeSet.ts): the lock body's optional `set` (TakeLockSet) is stored as take.json `set` when it hashes
 *                             to the setKey (409 SET_MISMATCH when it does not); none sent = the scene's plan.json when it does. The
 *                             list GET also copies each scene's plan into the takes locked on it whose frames are on it
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { FRAME0_KEY_RE } from '../../src/shared/carryContract.ts'
import { ROUTES, type TakeLockResponse, type TakesListResponse } from '../../src/shared/shotContract.ts'
import { carryOpening } from '../hero/carry.ts'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { JobRecords } from '../scene/jobRecords.ts'
import { LOCK_BODY_LIMIT, parseLockRequest, TAKE_ID_RE } from './request.ts'
import { serveShot } from './serveShots.ts'
import { discardTake, listTakes, lockTake } from './store.ts'
import { adoptAllTakes, lockPerf } from './takePerf.ts'
import { adoptAllSets, lockSet } from './takeSet.ts'
import { wordsRoute } from './wordsRoutes.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export type TakesEnv = Record<string, string | undefined>
/** the paid jobs filed under a take */
const TAKE_JOBS = ['hero', 'heroFinish', 'l2r'] as const
export const TAKE_BUSY = 'A still or render of this take is still running. Discard it once that lands.'
export interface TakesOverrides {
  /** the app's public/ (tests point it at a temp folder) */
  publicDir?: string
  now?: () => Date
}

export function labTakes(_env: TakesEnv = {}, over: TakesOverrides = {}): Plugin {
  const publicDir = over.publicDir ?? path.join(APP, 'public')
  return {
    name: 'lab-takes',
    apply: 'serve',
    configureServer(server) {
      // shots/ is watch-ignored, so Vite would answer files written after start with index.html: serve it from disk
      server.middlewares.use('/lab-assets/shots', (req, res, next) => { if (!serveShot(req, res, publicDir, req.url ?? '/')) next() })
      server.middlewares.use(ROUTES.takes, async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x')
        try {
          if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
            // the takes are listed once for both adoptions (fix 2026-10-30: once per world each), and again only when one wrote
            const listed = listTakes(publicDir)
            const perfs = adoptAllTakes(publicDir, listed) // takes locked on their scene's walk as it stands take a copy of it first (takePerf.ts)
            const sets = adoptAllSets(publicDir, listed) // and of its set, when their frames are on it (takeSet.ts)
            const body: TakesListResponse = { takes: perfs.length || sets.length ? listTakes(publicDir) : listed }
            return send(res, 200, body)
          }
          if (req.method === 'POST' && url.pathname === '/lock') {
            const refused = refuseForeign(req, { json: true })
            if (refused) return send(res, refused.status, { error: refused.message })
            let raw: unknown
            try { raw = JSON.parse(await readBody(req, LOCK_BODY_LIMIT)) } catch (e) {
              const err = e as Error & { status?: number }
              return send(res, err.status ?? 400, { error: err.status ? err.message : 'body must be JSON' })
            }
            const q = parseLockRequest(raw)
            if (typeof q === 'string') return send(res, 400, { error: q })
            // parseLockRequest (request.ts) rebuilds the request without the frame-0 key: it is checked and put back here
            const k = (raw as { frame0Key?: unknown }).frame0Key
            if (k !== undefined && k !== null && (typeof k !== 'string' || !FRAME0_KEY_RE.test(k))) return send(res, 400, { error: 'frame0Key must be 8 hex digits' })
            const sk = (raw as { setKey?: unknown }).setKey
            if (sk !== undefined && sk !== null && (typeof sk !== 'string' || !FRAME0_KEY_RE.test(sk))) return send(res, 400, { error: 'setKey must be 8 hex digits' })
            // the take a new take's words are copied from (takeWordsContract.ts TakeLockWords): a take id or nothing, never an error
            const wf = (raw as { wordsFrom?: unknown }).wordsFrom
            const from = typeof wf === 'string' && TAKE_ID_RE.test(wf) ? wf : undefined
            // the performer actually playing (TakeLockPerf): it must be the packId's walk; none sent = the scene's file when it is (takePerf.ts)
            const lp = lockPerf(publicDir, q, (raw as { perf?: unknown }).perf)
            if (!lp.ok) return send(res, lp.status, { error: lp.error })
            // the set on the stage (TakeLockSet): it must be the setKey's set; none sent = the scene's plan.json when it is (takeSet.ts)
            const ls = lockSet(publicDir, { worldId: q.worldId, ...(typeof sk === 'string' ? { setKey: sk } : {}) }, (raw as { set?: unknown }).set)
            if (!ls.ok) return send(res, ls.status, { error: ls.error })
            const { take, reused } = lockTake(publicDir, { ...q, ...(typeof k === 'string' ? { frame0Key: k } : {}), ...(typeof sk === 'string' ? { setKey: sk } : {}) }, over.now?.() ?? new Date(), from, lp.own, ls.own)
            // a carry that fails leaves the take as locked, as before carrying existed: the lock itself never fails on it
            const carried = reused ? null : await carryOpening(publicDir, take, listTakes(publicDir)).catch(() => null)
            const body: TakeLockResponse = { take, reused, ...(carried ? { carried } : {}) }
            return send(res, reused ? 200 : 201, body)
          }
          if (req.method === 'POST' && url.pathname === '/discard') {
            const refused = refuseForeign(req, { json: true })
            if (refused) return send(res, refused.status, { error: refused.message })
            let raw: { takeId?: unknown } | null
            try { raw = JSON.parse(await readBody(req, LOCK_BODY_LIMIT)) } catch { return send(res, 400, { error: 'body must be JSON' }) }
            if (typeof raw?.takeId !== 'string' || !TAKE_ID_RE.test(raw.takeId)) return send(res, 400, { error: 'takeId must be a take-… id' })
            // a still or render still running would land in a folder that has moved: paid for and never shown
            if (new JobRecords(publicDir).runningFor(raw.takeId, TAKE_JOBS)) return send(res, 409, { error: TAKE_BUSY })
            const gone = discardTake(publicDir, raw.takeId)
            return gone ? send(res, 200, gone) : send(res, 404, { error: 'no such take' })
          }
          // the take list's own routes: its rows, the words a take may start from, a take's words and name (wordsRoutes.ts)
          if (await wordsRoute(req, res, url, publicDir)) return
          if (req.method === 'POST') {
            const refused = refuseForeign(req, { json: true })
            if (refused) return send(res, refused.status, { error: refused.message })
          }
          return send(res, 404, { error: 'not found' })
        } catch (e) {
          return send(res, 500, { error: (e as Error).message })
        }
      })
    },
  }
}
