/**
 * The Layout-To-Render endpoint (docs/wave-b-contract.md, owner T3). Local pages only (server/guard.ts); the Comfy key
 * never leaves this process.
 *   GET  /__lab/l2r?take=take-…               -> L2RListResponse (renders, what the take has / lacks, prompt, price, running)
 *   POST /__lab/l2r {takeId, stillId, seed?, prompt?, wordsOnFrame?} -> L2RResponse after ONE runJob; the free finish then starts by itself
 *        (400 bad_request, 404 no_take, 409 busy / no_clay / clay_* / no_still / stale_still / words_changed (without wordsOnFrame) / not_approved, 429 budget,
 *        503 no_target / no_budget, 422 bad_output)
 *   POST /__lab/l2r/recover {jobId}           -> L2RResponse (fetches the job by id; never submits)
 *   POST /__lab/l2r/finish {renderId, grade?} -> L2RResponse (free, local Python; 409 while that render is finishing;
 *        grade false|true|{strength?} overrides what the render recorded; 409 no_master)
 *   POST /__lab/l2r/prompt {takeId, text}     -> PromptPreview (free: the override with its @tags expanded)
 *   GET  /__lab/l2r/price                     -> {done: L2RDone[]} (free: what l2rEstimate learns from, for Shoot's length line)
 *   GET  /__lab/l2r/shots?world=              -> ShotsListResponse (free: the world's takes and their renders' state, shots.ts)
 *   GET  /__lab/l2r/face?render=, POST /__lab/l2r/face/track, POST /__lab/l2r/face: the face detail pass (faceRoutes.ts)
 * POST / also takes hold (wide|closeup: the clay guides stage 1 only, or both) mid / end (approved keyframe still ids; 409 no_keyframe / stale_keyframe) and grade {strength?} (409 no_master),
 * and an @tag in the prompt override the Bible lacks is 400 unknown_tag. GET / also answers keyframes, chips and gradeTarget.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv, type Plugin } from 'vite'
import { ROUTES, type L2RListResponse } from '../../src/shared/shotContract.ts'
import { HOLD_PRESETS, type FinishRequest, type HoldPreset } from '../../src/shared/renderFinishContract.ts'
import type { L2RRenderExtra, L2RStatusExtra } from '../../src/studio/render/l2rExtra.ts'
import { probeVideo } from '../clip/ffmpeg.ts'
import { blankVideo } from './blank.ts'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { BusyError, jobRuntime, JobError, running } from '../jobs/index.ts'
import { legacyPythonValue, pythonPath } from '../python.ts'
import { logPythonGaps } from '../pythonCheck.ts'
import { redact } from '../stills/ledger.ts'
import { finishing, finishL2R, type FinishDeps } from './finish.ts'
import { readiness } from './inputs.ts'
import { briefFromBible, warnPrompt } from '../prompt/warn.ts'
import { bibleOf } from './keyframes.ts'
import { sentChipsFor } from './status.ts'
import { defaultPrompt, expandOverride } from './compose.ts'
import { estimateFor, paidRenders, recoverL2R, renderL2R, type L2RCtx, type L2RDeps } from './run.ts'
import { httpError, isL2RLabel, L2R_KEY, RENDER_RE, STILL_RE, TAKE_RE } from './spec.ts'
import { listRenders } from './store.ts'
import { shotRows } from './shots.ts'
import { noComfyTarget } from '../comfy/index.ts'
import { defaultYunet } from '../clay/service.ts'
import type { FacePassCtx } from './facePass.ts'
import { faceRunRoute, faceStatus, faceTrackRoute, registerFacePass } from './faceRoutes.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CODE: Record<number, string> = { 400: 'bad_request', 404: 'not_found', 409: 'busy', 422: 'bad_output', 429: 'budget' }
const MAX_PROMPT = 4000

export interface L2REnv { COMFY_API_KEY?: string; COMFY_BASE_URL?: string; LIFT_PYTHON?: string }
export interface L2ROverrides { deps?: Partial<L2RDeps>; finish?: FinishDeps; face?: Partial<Omit<FacePassCtx, 'l2r' | 'run'>> }

function codeOf(e: unknown, status: number): string | undefined {
  if (e instanceof JobError) return status === 503 ? (/CANVAS_DAY_BUDGET/.test(e.message) ? 'no_budget' : 'no_target') : CODE[status]
  const c = (e as { code?: string }).code
  return c && /^[a-z_]+$/.test(c) ? c : CODE[status]
}

export function parseRender(b: unknown): { takeId: string; stillId: string; seed?: number; prompt?: string; wordsOnFrame?: boolean } & L2RRenderExtra {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
  if (typeof o.takeId !== 'string' || !TAKE_RE.test(o.takeId)) throw httpError(400, 'takeId must be a take-… id', 'bad_request')
  if (typeof o.stillId !== 'string' || !STILL_RE.test(o.stillId)) throw httpError(400, 'stillId must be the approved still id', 'bad_request')
  if (o.seed !== undefined && !(Number.isInteger(o.seed) && (o.seed as number) >= 0 && (o.seed as number) < 2 ** 31)) throw httpError(400, 'seed must be a non-negative integer', 'bad_request')
  if (o.prompt !== undefined && (typeof o.prompt !== 'string' || o.prompt.length > MAX_PROMPT)) throw httpError(400, `prompt must be text of at most ${MAX_PROMPT} characters`, 'bad_request')
  for (const k of ['mid', 'end'] as const) if (o[k] !== undefined && (typeof o[k] !== 'string' || !STILL_RE.test(o[k] as string))) throw httpError(400, `${k} must be a keyframe still id`, 'bad_request')
  if (o.grade !== undefined && (o.grade === null || typeof o.grade !== 'object')) throw httpError(400, 'grade must be {strength?}', 'bad_request')
  if (o.wordsOnFrame !== undefined && typeof o.wordsOnFrame !== 'boolean') throw httpError(400, 'wordsOnFrame must be true or false', 'bad_request')
  if (o.hold !== undefined && !HOLD_PRESETS.includes(o.hold as HoldPreset)) throw httpError(400, `hold must be ${HOLD_PRESETS.join(' or ')}`, 'bad_request')
  return { takeId: o.takeId, stillId: o.stillId, seed: o.seed as number | undefined, prompt: o.prompt as string | undefined,
    ...(o.mid ? { mid: o.mid as string } : {}), ...(o.end ? { end: o.end as string } : {}), ...(o.grade ? { grade: o.grade as { strength?: number } } : {}),
    ...(o.hold ? { hold: o.hold as HoldPreset } : {}), ...(o.wordsOnFrame === true ? { wordsOnFrame: true } : {}) }
}

/** POST /finish {renderId, grade?}: absent = what the render recorded */
export function parseFinish(b: Record<string, unknown>): FinishRequest {
  if (typeof b?.renderId !== 'string' || !RENDER_RE.test(b.renderId)) throw httpError(400, 'renderId must be an l2r-… id', 'bad_request')
  const g = b.grade
  if (g !== undefined && g !== null && typeof g !== 'boolean' && typeof g !== 'object') throw httpError(400, 'grade must be true, false or {strength?}', 'bad_request')
  return { renderId: b.renderId, ...(g !== undefined ? { grade: g as FinishRequest['grade'] } : {}) }
}

export async function l2rStatus(ctx: L2RCtx, takeId: string, configured: boolean): Promise<L2RListResponse & L2RStatusExtra> {
  const rt = ctx.deps.runtime()
  const r = readiness(ctx.publicDir, takeId)
  const run = running(L2R_KEY, rt.store, isL2RLabel)
  const prompt = r.take ? await defaultPrompt(ctx.publicDir, r.take).catch(() => null) : null // an unknown tag: `missing` says so
  return {
    renders: listRenders(ctx.publicDir, takeId, rt.store), take: r.take, clay: r.clay, still: r.still, missing: r.missing,
    prompt,
    // warn-only checks on the prompt a render sends without an override (the override's own are on POST /prompt)
    ...(prompt && r.take ? { promptWarnings: warnPrompt(prompt, { step: 'render', brief: briefFromBible(bibleOf(ctx.publicDir, r.take.worldId)), take: r.take }) } : {}),
    ...(r.take ? sentChipsFor(ctx.publicDir, r) : {}),
    estimate: r.take ? estimateFor(ctx.publicDir, r.take.frames) : null,
    // the price follows the keyframe ticks: a press that sends a mid or end guide bills the surcharge (run.ts estimates it so)
    estimateKeyed: r.take ? estimateFor(ctx.publicDir, r.take.frames, true) : null,
    running: run ? { since: run.since, what: run.what, ...(run.jobId ? { jobId: run.jobId } : {}) } : null,
    finishing: finishing(), configured,
  }
}

export function labL2R(env: L2REnv = {}, over: L2ROverrides = {}): Plugin {
  return {
    name: 'lab-l2r',
    apply: 'serve',
    configureServer(server) {
      for (const k of ['COMFY_API_KEY', 'COMFY_BASE_URL'] as const) if (env[k] && !process.env[k]) process.env[k] = env[k]
      const cfg = server.config ?? {}
      const python = legacyPythonValue(env.LIFT_PYTHON, cfg)
      const root = cfg.root || APP
      const publicDir = cfg.publicDir || path.join(root, 'public')
      const pyOf = () => pythonPath(python)
      logPythonGaps(pyOf(), root) // which optional pieces (the massing clay) this Python cannot do, once at start
      const ctx: L2RCtx = { publicDir, appRoot: root, deps: { runtime: jobRuntime, probe: (f) => probeVideo(f), python: pyOf, blank: (f, n) => blankVideo(f, n), ...over.deps } }
      const configured = () => !!(process.env.COMFY_API_KEY || process.env.COMFY_BASE_URL)
      // the face detail pass (faceRoutes.ts): its own Python steps on the finish's Python, YuNet as the clay finds it
      const face: FacePassCtx = { l2r: ctx, run: over.finish?.run, yunet: process.env.CLAY_YUNET ?? (cfg.mode ? loadEnv(cfg.mode, cfg.envDir || APP, 'CLAY_').CLAY_YUNET : undefined) ?? defaultYunet(root), ...over.face }
      registerFacePass(face)
      const autoFinish = (id: string) => { finishL2R(ctx, id, over.finish).catch(() => { /* recorded as finishError on the render */ }) }

      server.middlewares.use(ROUTES.l2r, async (req, res) => {
        const url = new URL(req.url ?? '', 'http://lab')
        const route = url.pathname.replace(/\/+$/, '') || '/'
        try {
          if (req.method === 'GET' && route === '/') {
            const take = url.searchParams.get('take') ?? ''
            if (!TAKE_RE.test(take)) throw httpError(400, 'take must be a take-… id', 'bad_request')
            return send(res, 200, await l2rStatus(ctx, take, configured()))
          }
          // free: the paid renders the price learns from, so Shoot prices a take's length with the same function (price.ts)
          if (req.method === 'GET' && route === '/price') return send(res, 200, { done: paidRenders(ctx.publicDir) })
          // free: one world's takes with what their renders say (the Render page's shots list, Export's other shots)
          if (req.method === 'GET' && route === '/shots') {
            const world = url.searchParams.get('world') ?? ''
            if (!world || world.length > 200) throw httpError(400, 'world must be a world id', 'bad_request')
            return send(res, 200, { shots: shotRows(ctx.publicDir, world, ctx.deps.runtime().store) })
          }
          if (req.method === 'GET' && route === '/face') return send(res, 200, await faceStatus(face, url.searchParams.get('render') ?? '', configured()))
          if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' })
          const refused = refuseForeign(req, { json: true })
          if (refused) return send(res, refused.status, { error: refused.message })
          if (!['/', '/recover', '/finish', '/prompt', '/face', '/face/track'].includes(route)) return send(res, 404, { error: 'no such route', code: 'not_found' })
          let body: Record<string, unknown>
          try { body = JSON.parse(await readBody(req)) } catch (e) { throw (e as { status?: number }).status ? e : httpError(400, 'body must be JSON', 'bad_request') }
          if (route === '/finish') {
            const { renderId, ...want } = parseFinish(body)
            return send(res, 200, { render: await finishL2R(ctx, renderId, over.finish, want) })
          }
          if (route === '/face/track') return send(res, 200, await faceTrackRoute(face, body))
          if (route === '/face') {
            if (!configured()) throw httpError(503, noComfyTarget(), 'no_target')
            return send(res, 200, await faceRunRoute(face, body))
          }
          if (route === '/prompt') {
            const q = parseRender({ ...body, stillId: 'x' })
            const r = readiness(ctx.publicDir, q.takeId)
            if (!r.take) throw httpError(404, 'that take is not locked on disk', 'no_take')
            if (typeof body.text !== 'string' || body.text.length > MAX_PROMPT) throw httpError(400, 'text must be a prompt', 'bad_request')
            const x = await expandOverride(ctx.publicDir, r.take, body.text)
            // a typed override is the owner's own text: warned about, never changed (fire / grain words included)
            return send(res, 200, { ...x, warnings: warnPrompt(body.text, { step: 'render', brief: briefFromBible(bibleOf(ctx.publicDir, r.take.worldId)), take: r.take, pasted: true }) })
          }
          if (route === '/recover') {
            if (typeof body?.jobId !== 'string') throw httpError(400, 'jobId is required', 'bad_request')
            const render = await recoverL2R(ctx, body.jobId)
            if (!render.finished) autoFinish(render.id)
            return send(res, 200, { render })
          }
          const q = parseRender(body)
          if (!configured()) throw httpError(503, noComfyTarget(), 'no_target')
          const render = await renderL2R(ctx, q)
          autoFinish(render.id)
          return send(res, 200, { render })
        } catch (e) {
          if (res.headersSent) return
          const status = (e as { status?: number }).status ?? 500
          const code = codeOf(e, status)
          send(res, status, { error: redact(e instanceof Error ? e.message : String(e)), ...(code ? { code } : {}), ...(e instanceof BusyError ? { running: e.running } : {}) })
        }
      })
    },
  }
}
