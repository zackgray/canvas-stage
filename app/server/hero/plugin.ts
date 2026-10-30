/**
 * The hero-still endpoint (docs/wave-b-contract.md, owner T2): the take's opening frame, the Klein 4B render, approve, list.
 * Local pages only (server/guard.ts); the Comfy key never leaves this process.
 *   POST /__lab/hero/opening?take=take-…&key=  (PNG body, 1920x1088)     -> { ok, bytes, startKey }
 *   POST /__lab/hero {takeId, seed?, count?, prompt?, sid?}              -> HeroResponse (one runJob; 400/404 before anything is
 *        counted, 409 busy while one runs, 429 budget, 503 no_target / no_budget, 422 bad_output)
 *   POST /__lab/hero/approve {takeId, stillId}                           -> HeroResponse (one approved still per take; 409 stale)
 *   POST /__lab/hero/unapprove {takeId, stillId}                         -> HeroResponse (the approval comes off; the still stays)
 *   POST /__lab/hero/finish {takeId, ids?}                               -> HeroResponse (kit stills: the Klein step alone for draws
 *        whose finish never ran, ~2 cr a still; 404 none waiting, 409 stale / busy, 429 budget)
 *   POST /__lab/hero/preview {takeId, role?, frame?, preset?, materials?, count?, prompt?} -> StillPreviewResponse (FREE: what the
 *        press would send, composed by the press's own function, no Cloud call; kit takes; preview.ts)
 *   GET  /__lab/hero?take=take-…                                         -> HeroListResponse & KitListExtra (unfinished draws)
 *   GET  /__lab/hero/judge?take=&still=                                  -> StillJudge (FREE: each staged person's 100 % crop, card and
 *        verdict, the pieces with a board tile; stillPasses.ts)
 *   POST /__lab/hero/redraw {takeId, stillId, pass: 'face'|'prop', subject} -> { candidate } (ONE Klein crop job, ~3 cr; a pass
 *        candidate from before the spend, Keep / Discard / Recover through /__lab/passes; 409 busy / stale / redrawn / no_face …)
 * Recover a lost render with POST /__lab/jobs/recover {jobId}; the next GET lists it.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { ROUTES, type HeroApproveRequest, type HeroListResponse, type HeroResponse } from '../../src/shared/shotContract.ts'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { BusyError, exclusive, JobError, jobRuntime, running } from '../jobs/index.ts'
import { runPython } from '../l2r/finish.ts'
import { STILL_SET_WHY, stillSetMoved } from '../l2r/inputs.ts'
import { legacyPythonValue, pythonPath } from '../python.ts'
import { redact } from '../stills/ledger.ts'
import { faceDepsOf } from './faceCount.ts'
import { resumeFinish, unfinishedStills } from './kitFinish.ts'
import type { KitListExtra } from './kitSpec.ts'
import { HERO_OTHERS, parseRenderRequest, renderHero, type HeroCtx, type HeroDeps } from './run.ts'
import { HERO_KEY, isHeroLabel } from './spec.ts'
import { takeBible } from '../takes/words.ts'
import { stillHardWhy, wordsOnlyBehind } from '../../src/shared/wordsOnFrame.ts'
import { approveStill, HeroHttpError, listStills, openingInfo, readTake, stillIdOf, takeIdOf, unapproveStill, unrecovered } from './store.ts'
import { saveOpening } from './upload.ts'
import { setLookPointer } from './lookPointer.ts'
import { withVersions } from './pngVersion.ts'
import { previewStill } from './preview.ts'
import { noComfyTarget } from '../comfy/index.ts'
import { judgeFor, redrawStill, registerStillPasses } from './stillPasses.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const STATUS_CODE: Record<number, string> = { 400: 'bad_request', 404: 'not_found', 409: 'busy', 413: 'too_large', 422: 'bad_output', 429: 'budget' }

export interface HeroEnv { COMFY_API_KEY?: string; COMFY_BASE_URL?: string; LIFT_PYTHON?: string }
export interface HeroOverrides { deps?: Partial<HeroDeps> }

function codeOf(e: unknown, status: number): string | undefined {
  if (e instanceof HeroHttpError) return e.code
  if (e instanceof JobError) return status === 503 ? (/CANVAS_DAY_BUDGET/.test(e.message) ? 'no_budget' : 'no_target') : STATUS_CODE[status]
  return STATUS_CODE[status] ?? (status === 503 ? 'no_target' : undefined)
}

export function labHero(env: HeroEnv = {}, over: HeroOverrides = {}): Plugin {
  return {
    name: 'lab-hero',
    apply: 'serve',
    configureServer(server) {
      for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL'] as const) if (env[k] && !process.env[k]) process.env[k] = env[k]
      const publicDir = server.config?.publicDir || path.join(server.config?.root || APP, 'public')
      // the kit still's free colour-match runs track D's script on the app's one Python, as the L2R finish does (server/python.ts)
      const cfg = server.config ?? {}
      const lift = legacyPythonValue(env.LIFT_PYTHON, cfg)
      const python = () => pythonPath(lift)
      const ctx: HeroCtx = { publicDir, deps: { runtime: jobRuntime, python, runPython, appDir: cfg.root || APP, ...over.deps } }
      const configured = () => !!(process.env.COMFY_API_KEY || process.env.COMFY_BASE_URL)
      registerStillPasses(ctx) // Keep on a still's redraw, and Recover of a face or prop redraw by job id (server/passes)

      server.middlewares.use(ROUTES.hero, async (req, res) => {
        const url = new URL(req.url ?? '', 'http://lab')
        const route = url.pathname.replace(/\/+$/, '') || '/'
        const fail = (e: unknown) => {
          const status = (e as { status?: number }).status ?? 500
          send(res, status, {
            error: redact(e instanceof Error ? e.message : String(e)), ...(codeOf(e, status) ? { code: codeOf(e, status) } : {}),
            ...(e instanceof BusyError ? { running: e.running } : {}), ...(e instanceof JobError && e.jobId ? { jobId: e.jobId } : {}),
          })
        }
        try {
          if (req.method === 'GET') {
            if (route === '/judge') return send(res, 200, await judgeFor(publicDir, url.searchParams.get('take'), url.searchParams.get('still'), faceDepsOf(ctx.deps)))
            if (route !== '/') return send(res, 404, { error: 'no such route', code: 'not_found' })
            const takeId = takeIdOf(url.searchParams.get('take'))
            const take = await readTake(publicDir, takeId)
            const store = ctx.deps.runtime().store
            const r = running(HERO_KEY, store, isHeroLabel)
            // F1: each still says why it is behind the scene's Bible now, in Render's own words (stillBible.ts), so the Stage agrees;
            // the Bible as the take reads it (its own words as the prompt: takes/words.ts); words alone never stale it (wordsOnFrame.ts)
            const bible = takeBible(publicDir, take)
            const stills = (await listStills(publicDir, takeId, store)).map((s) => {
              // a still drawn before the set changed shows the old set: stale in Render's own words (l2r/inputs.ts stillSetMoved)
              const why = stillHardWhy(s, bible) ?? (stillSetMoved(publicDir, take, s) ? STILL_SET_WHY : null)
              return why ? { ...s, bibleWhy: why } : wordsOnlyBehind(s, bible) ? { ...s, wordsChanged: true } : s
            })
            const body: HeroListResponse & KitListExtra = {
              // each picture's URL carries its file's version, so the page never keeps an older or cut-off copy (pngVersion.ts)
              stills: withVersions(publicDir, stills), opening: await openingInfo(publicDir, takeId),
              running: r ? { since: r.since, what: r.what } : null, unrecovered: unrecovered(store, publicDir, takeId),
              unfinished: withVersions(publicDir, await unfinishedStills(publicDir, takeId, store)),
            }
            return send(res, 200, body)
          }
          if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' })
          if (!['/', '/opening', '/approve', '/unapprove', '/finish', '/preview', '/redraw', '/look'].includes(route)) return send(res, 404, { error: 'no such route', code: 'not_found' })
          const refused = refuseForeign(req, { json: route !== '/opening' })
          if (refused) return send(res, refused.status, { error: refused.message })
          if (route === '/opening') {
            const saved = await saveOpening(publicDir, req, url.searchParams.get('take'), url.searchParams.get('key'))
            return send(res, 200, { ok: true, ...saved })
          }
          let body: unknown
          try { body = JSON.parse(await readBody(req)) } catch (e) { throw (e as { status?: number }).status ? e : new HeroHttpError(400, 'body must be JSON', 'bad_request') }
          // free: what a press would send, composed with no Cloud call (needs no Comfy target, never waits on a running job)
          if (route === '/preview') return send(res, 200, await previewStill(ctx, body))
          if (route === '/look') {
            const b = (body ?? {}) as { takeId?: unknown; stillId?: unknown }
            const take = await readTake(publicDir, takeIdOf(b.takeId))
            return send(res, 200, { look: await setLookPointer(publicDir, take, b.stillId) })
          }
          if (route === '/approve') {
            const b = (body ?? {}) as Partial<HeroApproveRequest>
            const take = await readTake(publicDir, takeIdOf(b.takeId))
            const still = await approveStill(publicDir, take, stillIdOf(b.stillId), ctx.deps.runtime().store)
            return send(res, 200, { still } satisfies HeroResponse)
          }
          if (route === '/unapprove') {
            const b = (body ?? {}) as Partial<HeroApproveRequest>
            const take = await readTake(publicDir, takeIdOf(b.takeId))
            const still = await unapproveStill(publicDir, take, stillIdOf(b.stillId), ctx.deps.runtime().store)
            return send(res, 200, { still } satisfies HeroResponse)
          }
          if (route === '/finish') {
            const b = (body ?? {}) as { takeId?: unknown; ids?: unknown }
            const take = await readTake(publicDir, takeIdOf(b.takeId))
            if (b.ids !== undefined && !(Array.isArray(b.ids) && b.ids.length <= 4)) throw new HeroHttpError(400, 'ids must be up to 4 still ids', 'bad_request')
            const ids = (b.ids as unknown[] | undefined)?.map(stillIdOf)
            if (!configured()) throw Object.assign(new Error(noComfyTarget()), { status: 503, code: 'no_target' })
            const rt = ctx.deps.runtime()
            const stills = await exclusive(HERO_KEY, `finishing hero stills of ${take.id}`, rt.store, isHeroLabel, () => resumeFinish(ctx, take, ids, rt), HERO_OTHERS)
            return send(res, 200, { still: stills[0], stills } satisfies HeroResponse)
          }
          if (route === '/redraw') {
            if (!configured()) throw Object.assign(new Error(noComfyTarget()), { status: 503, code: 'no_target' })
            return send(res, 200, { candidate: await redrawStill(ctx, body) })
          }
          const q = parseRenderRequest(body)
          if (!configured()) throw Object.assign(new Error(noComfyTarget()), { status: 503, code: 'no_target' })
          const { stills } = await renderHero(ctx, q)
          return send(res, 200, { still: stills[0], stills } satisfies HeroResponse)
        } catch (e) {
          if (!res.headersSent) fail(e)
        }
      })
    },
  }
}
