/**
 * The routes' side of the still judge and its redraws (plugin.ts): GET /__lab/hero/judge (free), POST /__lab/hero/redraw (paid,
 * one Klein job, a pass candidate), and the registration of the 'still' applier and the 'face' / 'prop' recoverers and restart
 * settles with server/passes. Every refusal before the spend is free and in plain words.
 */
import path from 'node:path'
import type { PassCandidate } from '../../src/shared/passContract.ts'
import { isStale } from '../../src/shared/shotContract.ts'
import { registerApplier, registerRecoverer, registerSettler, type PassSettler } from '../passes/registry.ts'
import { planFaceRedraw } from './faceRedraw.ts'
import { readPng } from './idMask.ts'
import type { FaceDeps } from './faceCount.ts'
import { judgeStill } from './judge.ts'
import { refuseSetMoved } from './kitInputs.ts'
import type { KitStill } from './kitSpec.ts'
import { planPropRedraw } from './propRedraw.ts'
import { recoverRedraw, runRedraw } from './redrawRun.ts'
import { REDRAW_KEY, redrawLabel, type RedrawRequest, type StillJudge } from './redrawSpec.ts'
import type { HeroCtx } from './run.ts'
import { stillApplier, redrawnInto } from './stillApplier.ts'
import { heroDirOf, HeroHttpError, readJson, readTake, stillFile, stillIdOf, takeIdOf } from './store.ts'

/** a still the judge or a redraw can work on: on disk with its picture */
async function stillOf(publicDir: string, takeId: string, stillId: string): Promise<KitStill> {
  const s = await readJson<KitStill>(stillFile(heroDirOf(publicDir, takeId), stillId))
  if (!s || s.id !== stillId || s.takeId !== takeId) throw new HeroHttpError(404, `${stillId} is not a still of ${takeId}`, 'not_found')
  return s
}

/** the judge, plus which still a Keep already made from this one (its redraw buttons go there instead) */
export async function judgeFor(publicDir: string, takeRaw: unknown, stillRaw: unknown, faceDeps?: FaceDeps): Promise<StillJudge & { redrawnInto: string | null }> {
  const take = await readTake(publicDir, takeIdOf(takeRaw))
  const still = await stillOf(publicDir, take.id, stillIdOf(stillRaw))
  return { ...(await judgeStill(publicDir, take, still, faceDeps)), redrawnInto: redrawnInto(publicDir, take.id, still.id) }
}

export function parseRedraw(b: unknown): RedrawRequest {
  const o = (b ?? {}) as Record<string, unknown>
  if (o.pass !== 'face' && o.pass !== 'prop') throw new HeroHttpError(400, "pass must be 'face' or 'prop'", 'bad_request')
  if (typeof o.subject !== 'string' || !/^(hero|extra:\d+:\d+|[a-z][a-z0-9_-]{0,31})$/.test(o.subject)) throw new HeroHttpError(400, 'subject must be a staged person or a piece tag', 'bad_request')
  return { takeId: takeIdOf(o.takeId), stillId: stillIdOf(o.stillId), pass: o.pass, subject: o.subject }
}

/** POST /__lab/hero/redraw: free checks, the plan, then ONE paid job; answers the finished candidate */
export async function redrawStill(ctx: HeroCtx, body: unknown): Promise<PassCandidate> {
  const q = parseRedraw(body)
  const take = await readTake(ctx.publicDir, q.takeId)
  const still = await stillOf(ctx.publicDir, take.id, q.stillId)
  if (isStale(still, take)) throw new HeroHttpError(409, 'That still shows an older start of the take: draw the frame again before redrawing parts of it. Nothing was billed.', 'stale')
  refuseSetMoved(ctx.publicDir, take) // the redraw cuts its mask from the clay's ID pass: an old set's would paste the wrong place
  const into = redrawnInto(ctx.publicDir, take.id, still.id)
  if (into) throw new HeroHttpError(409, `This still was already redrawn into ${into}; redraw that one instead. Nothing was billed.`, 'redrawn')
  const img = readPng(path.join(heroDirOf(ctx.publicDir, take.id), `${still.id}.png`))
  const size = { width: img.width, height: img.height }
  const plan = q.pass === 'face' ? await planFaceRedraw(ctx.publicDir, take, still, q.subject, size) : planPropRedraw(ctx.publicDir, take, still, q.subject, size)
  return runRedraw(ctx, { ...plan, take, still })
}

export const REDRAW_INTERRUPTED = 'Interrupted before it was sent to Cloud (the dev server stopped or restarted): nothing was billed. Redraw it again.'

/** the still's applier, the two recoverers and their restart settle; called once by the hero plugin (the registry is process-wide) */
export function registerStillPasses(ctx: HeroCtx): void {
  registerApplier('still', stillApplier(ctx.deps.now))
  registerRecoverer('face', recoverRedraw(ctx))
  registerRecoverer('prop', recoverRedraw(ctx))
  // one redraw at a time (exclusive REDRAW_KEY, held from before the candidate to the job's end): no claim here = not in flight here
  const settle: PassSettler = { store: () => ctx.deps.runtime().store, key: REDRAW_KEY, label: (c) => redrawLabel(c.takeId, c.id), interrupted: REDRAW_INTERRUPTED }
  registerSettler('face', settle)
  registerSettler('prop', settle)
}
