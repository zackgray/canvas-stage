/**
 * Dev-only Vite middleware for made moves (docs/plan-kimodo-live.md 1.2, docs/motion-box-contract.md). Free: the
 * owner's own motion computer makes the move, so nothing here touches the jobs/budget machinery. Local pages only
 * (server/guard.ts). MOTION_BOX_URL unset turns the generator off (health: off); the token is the box's shared secret.
 *   GET  /__lab/motion/health           -> {state: off|offline|warming|busy|ready, secondsPerTry?} (2 s probe, cached 10 s)
 *   POST /__lab/motion/make   {spec,n?,seeds?} -> {jobId}; writes the on-disk in-flight record (re-attach on restart)
 *   GET  /__lab/motion/job?id=           -> the box job (its stage the first word: "generating 3/4" is generating) and when it started,
 *                                           plus lost-contact / stalled bookkeeping (plan 1.4)
 *   POST /__lab/motion/cancel {id?}      -> {stage}
 *   POST /__lab/motion/keep   {job,try,label} -> downloads the try, writes public/lab-assets/motions/<id>/, {id: gen:<id>}
 *   GET  /__lab/motion/clips             -> the kept user clips for the library loader
 *   POST /__lab/motion/shown  {job,shown}  -> which ranked try the panel shows now (Try another), kept in the in-flight record
 *   POST /__lab/motion/discard {job}       -> the result is done with (used, discarded or replaced): the record goes
 * A make may name its `owner` (the kit world) and `words`; /job answers them with `shown` and the spec, so the result of a make
 * survives the person being deselected, the view switching and a reload.
 */
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { refuseForeign } from '../guard.ts'
import { boxCancel, boxFile, boxHealth, boxMake, BoxError, type BoxTarget } from './box.ts'
import { jobView } from './jobView.ts'
import { MotionStore } from './store.ts'
import type { InFlight, MotionHealth } from './types.ts'

export interface MotionEnv { MOTION_BOX_URL?: string; MOTION_BOX_TOKEN?: string }

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
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) { reject(new Error('body too large')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** a spec the box would 422 anyway is caught here so the panel can say so without a round trip. */
function validSpec(raw: unknown): raw is Record<string, unknown> {
  const s = raw as Record<string, unknown> | null
  return !!s && typeof s === 'object' && typeof s.sentence === 'string' && s.sentence.length > 0 &&
    typeof s.class === 'string' && typeof s.seconds === 'number' && s.seconds > 0 && s.seconds <= 10
}

/** the ClipDef-shaped clip.json for a kept move (plan 1.5): ClipDef fields plus the run's record. */
function clipJson(id: string, spec: Record<string, unknown>, label: string, job: string, tryMeta: Record<string, unknown>, encoder: string | null) {
  return {
    url: `/lab-assets/motions/${id}/clip.bvh`,
    source: { generated: `kimodo:${job}/${typeof tryMeta.seed === 'number' ? tryMeta.seed : '?'}` },
    note: label,
    root: 'pinned',
    in: 0,
    out: spec.seconds,
    ...(spec.hold !== undefined ? { hold: spec.hold } : {}),
    ...(spec.grab !== undefined || spec.release !== undefined ? { prop: { grab: spec.grab, release: spec.release } } : {}),
    ...(Array.isArray(spec.phases) ? { phases: spec.phases } : {}),
    sentence: spec.sentence,
    class: spec.class,
    seed: tryMeta.seed,
    scores: tryMeta.scores ?? null,
    encoder,
    date: new Date().toISOString().slice(0, 10),
  }
}

export function labMotion(env: MotionEnv, opts: { lostAfterMs?: number; jobBudgetMs?: number } = {}): Plugin {
  const lostAfterMs = opts.lostAfterMs ?? 30000 // plan 1.4: polls failing for 30 s -> lost contact
  const jobBudgetMs = opts.jobBudgetMs ?? 600000 // plan 1.4: whole job 10 min -> failed, tries kept
  const target: BoxTarget | null = env.MOTION_BOX_URL ? { baseUrl: env.MOTION_BOX_URL.replace(/\/+$/, ''), token: env.MOTION_BOX_TOKEN } : null
  let healthCache: { at: number; state: MotionHealth; secondsPerTry?: number } | null = null
  return {
    name: 'lab-motion',
    apply: 'serve',
    configureServer(server) {
      const store = new MotionStore(path.resolve(server.config.root, 'public/lab-assets/motions'))
      server.middlewares.use('/__lab/motion', async (req, res) => {
        const route = new URL(req.url ?? '', 'http://lab').pathname.replace(/\/+$/, '') || '/'
        try {
          if (route === '/health' && req.method === 'GET') {
            const refused = refuseForeign(req)
            if (refused) return send(res, refused.status, { error: refused.message })
            if (!target) return send(res, 200, { state: 'off' as MotionHealth })
            // secondsPerTry (the box's own measure) lets the panel say honestly how long a make takes
            const reply = (h: { state: MotionHealth; secondsPerTry?: number }) => send(res, 200, { state: h.state, ...(h.secondsPerTry ? { secondsPerTry: h.secondsPerTry } : {}) })
            if (healthCache && Date.now() - healthCache.at < 10000) return reply(healthCache)
            let state: MotionHealth = 'offline', secondsPerTry: number | undefined
            try { const h = await boxHealth(target); state = h.state; secondsPerTry = typeof h.secondsPerTry === 'number' ? h.secondsPerTry : undefined } catch { /* offline */ }
            healthCache = { at: Date.now(), state, secondsPerTry }
            return reply(healthCache)
          }
          if (route === '/make') {
            if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
            const refused = refuseForeign(req, { json: true })
            if (refused) return send(res, refused.status, { error: refused.message })
            if (!target) return send(res, 503, { error: 'The motion computer is not set up.' })
            let body: { spec?: unknown; n?: unknown; seeds?: unknown; owner?: unknown; words?: unknown }
            try { body = JSON.parse(await readBody(req)) } catch { return send(res, 400, { error: 'bad JSON' }) }
            if (!validSpec(body.spec)) return send(res, 422, { error: 'bad spec', message: 'The move is incomplete; describe it again.' })
            const n = Math.min(8, Math.max(1, typeof body.n === 'number' ? Math.floor(body.n) : 8)) // the box runs at most 8 a round (motionbox jobs.py)
            const seeds = Array.isArray(body.seeds) ? body.seeds.filter((s): s is number => typeof s === 'number') : undefined
            try {
              const jobId = await boxMake(target, { spec: body.spec, n, ...(seeds ? { seeds } : {}) })
              const owner = typeof body.owner === 'string' ? body.owner.slice(0, 120) : undefined
              const words = typeof body.words === 'string' ? body.words.slice(0, 400) : undefined
              const rec: InFlight = { jobId, spec: body.spec, n, createdAt: Date.now(), lastOk: Date.now(), stage: 'encoding', ...(owner ? { owner } : {}), ...(words ? { words } : {}), shown: 0 }
              await store.saveInFlight(rec)
              return send(res, 200, { jobId })
            } catch (e) {
              if (e instanceof BoxError && e.status === 409) return send(res, 409, { error: 'busy', message: 'The motion computer is making another move; yours starts when it finishes.' })
              if (e instanceof BoxError && e.status === 422) return send(res, 422, { error: 'bad spec', message: e.message })
              throw e
            }
          }
          if (route === '/job') {
            if (req.method !== 'GET') return send(res, 405, { error: 'GET only' })
            const refused = refuseForeign(req)
            if (refused) return send(res, refused.status, { error: refused.message })
            const rec = await store.inFlight()
            if (!rec) return send(res, 404, { error: 'no in-flight move' })
            const view = await jobView(target, store, rec, lostAfterMs, jobBudgetMs)
            return send(res, 200, { ...view, ...(rec.owner ? { owner: rec.owner } : {}), ...(rec.words ? { words: rec.words } : {}), shown: rec.shown ?? 0, spec: rec.spec })
          }          if (route === '/cancel') {
            if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
            const refused = refuseForeign(req, { json: true })
            if (refused) return send(res, refused.status, { error: refused.message })
            if (!target) return send(res, 503, { error: 'The motion computer is not set up.' })
            let body: { id?: unknown }
            try { body = JSON.parse(await readBody(req)) } catch { return send(res, 400, { error: 'bad JSON' }) }
            const rec = await store.inFlight()
            const jobId = typeof body.id === 'string' ? body.id : rec?.jobId
            if (!jobId) return send(res, 404, { error: 'no in-flight move' })
            const stage = await boxCancel(target, jobId)
            if (rec && rec.jobId === jobId) await store.saveInFlight({ ...rec, stage })
            return send(res, 200, { stage })
          }
          if (route === '/keep') {
            if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
            const refused = refuseForeign(req, { json: true })
            if (refused) return send(res, refused.status, { error: refused.message })
            if (!target) return send(res, 503, { error: 'The motion computer is not set up.' })
            let body: { job?: unknown; try?: unknown; label?: unknown }
            try { body = JSON.parse(await readBody(req)) } catch { return send(res, 400, { error: 'bad JSON' }) }
            const rec = await store.inFlight()
            // a try is named as the box names it: "try6" (the motion box) or a number (the fake box)
            const tryOk = typeof body.try === 'number' || (typeof body.try === 'string' && /^[\w-]{1,32}$/.test(body.try))
            if (!rec || rec.jobId !== body.job || !tryOk) return send(res, 404, { error: 'no such try' })
            const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : 'made move'
            const already = rec.kept?.[String(body.try)]
            if (already) return send(res, 200, already) // Play here, then Use this one: the try is kept once
            let bvh: Buffer, strip: Buffer, tryMeta: Record<string, unknown>
            try {
              ;[bvh, strip, tryMeta] = await Promise.all([
                boxFile(target, rec.jobId, body.try as number | string, 'bvh'), boxFile(target, rec.jobId, body.try as number | string, 'png'), boxFile(target, rec.jobId, body.try as number | string, 'json'),
              ]).then(async ([b, p, j]) => [b, p, JSON.parse(j.toString('utf8')) as Record<string, unknown>] as const)
            } catch {
              return send(res, 502, { error: 'The download failed. Try again.' }) // the job stays on the box for 24 h
            }
            const encoder = target ? await boxHealth(target).then((h) => h.encoder).catch(() => null) : null
            const id = await store.motionId(body.label)
            const json = clipJson(id, rec.spec as Record<string, unknown>, label, rec.jobId, tryMeta, encoder)
            await store.keepClip(id, bvh, strip, json)
            const kept = { id: `gen:${id}`, clip: json }
            await store.saveInFlight({ ...rec, kept: { ...rec.kept, [String(body.try)]: kept } })
            return send(res, 200, kept)
          }
          if (route === '/shown' || route === '/discard') {
            if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
            const refused = refuseForeign(req, { json: true })
            if (refused) return send(res, refused.status, { error: refused.message })
            let body: { job?: unknown; shown?: unknown }
            try { body = JSON.parse(await readBody(req)) } catch { return send(res, 400, { error: 'bad JSON' }) }
            const rec = await store.inFlight()
            if (!rec || rec.jobId !== body.job) return send(res, 404, { error: 'no such move' })
            if (route === '/discard') { await store.clearInFlight(); return send(res, 200, {}) }
            if (typeof body.shown !== 'number' || !Number.isInteger(body.shown) || body.shown < 0) return send(res, 400, { error: 'shown must be a whole number' })
            await store.saveInFlight({ ...rec, shown: body.shown })
            return send(res, 200, { shown: body.shown })
          }
          if (route === '/clips' && req.method === 'GET') {
            const refused = refuseForeign(req)
            if (refused) return send(res, refused.status, { error: refused.message })
            return send(res, 200, { clips: await store.clips() })
          }
          return send(res, 404, { error: 'no such route' })
        } catch (e) {
          if (!res.headersSent) send(res, e instanceof BoxError && e.status ? e.status : 500, { error: e instanceof Error ? e.message : String(e) })
        }
      })
    },
  }
}
