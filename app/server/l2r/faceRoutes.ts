/**
 * The face pass routes under /__lab/l2r (src/studio/render/FacePassTypes.ts), and the two hooks it plugs into server/passes: the
 * 'render' applier (Keep, faceApply.ts), the 'facePass' recoverer (by job id, never a resubmit) and its restart settle (the shared
 * server/passes/settle.ts: a candidate a restart left 'running' gets its job id from the runner's record, and one with no record and
 * nothing in flight here never reached Cloud: failed, nothing billed, free to press again). GET /face settles before it answers.
 */
import type { FacePassStatus, FacePersonView } from '../../src/studio/render/FacePassTypes.ts'
import { running } from '../jobs/index.ts'
import { registerApplier, registerRecoverer, registerSettler } from '../passes/registry.ts'
import { settleAll } from '../passes/settle.ts'
import { listCandidates } from '../passes/store.ts'
import { readTake } from '../takes/store.ts'
import { renderApplier } from './faceApply.ts'
import { isActive, recoverFacePass, startFacePass, type FacePassCtx } from './facePass.ts'
import { facePeople } from './facePeople.ts'
import { FACE_KEY, faceLabel, facePassCredits, isFaceLabel, SUBJECT_RE } from './faceSpec.ts'
import { readTrack, trackFace } from './faceTrack.ts'
import { httpError, RENDER_RE } from './spec.ts'
import { findRender } from './store.ts'

export const FACE_INTERRUPTED = 'Interrupted before it was sent to Cloud (the dev server stopped or restarted): nothing was billed. Press Fix this face again.'

/** register the pass hooks once per server (the registry is per process; a second mount replaces the first) */
export function registerFacePass(ctx: FacePassCtx): void {
  registerApplier('render', renderApplier(ctx))
  registerRecoverer('facePass', (c) => recoverFacePass(ctx, c))
  registerSettler('facePass', { store: () => ctx.l2r.deps.runtime().store, key: FACE_KEY, active: (c) => isActive(c.id), interrupted: FACE_INTERRUPTED,
    label: (c) => faceLabel(c.takeId, c.target.kind === 'render' ? c.target.renderId : '', c.id) })
}

function body(b: Record<string, unknown>): { renderId: string; subject: string } {
  if (typeof b?.renderId !== 'string' || !RENDER_RE.test(b.renderId)) throw httpError(400, 'renderId must be an l2r-… id', 'bad_request')
  if (typeof b.subject !== 'string' || !SUBJECT_RE.test(b.subject)) throw httpError(400, 'subject must be hero or extra:<index>:<variant>', 'bad_request')
  return { renderId: b.renderId, subject: b.subject }
}

export async function faceStatus(ctx: FacePassCtx, renderId: string, configured: boolean): Promise<FacePassStatus> {
  if (!RENDER_RE.test(renderId)) throw httpError(400, 'render must be an l2r-… id', 'bad_request')
  const r = findRender(ctx.l2r.publicDir, renderId)
  if (!r) throw httpError(404, `no render ${renderId}`, 'not_found')
  const take = readTake(ctx.l2r.publicDir, r.takeId)
  await settleAll(ctx.l2r.publicDir, await listCandidates(ctx.l2r.publicDir, r.takeId))
  const people: FacePersonView[] = take ? (await (ctx.people ?? facePeople)(ctx.l2r.publicDir, take)).map((p) => ({
    subject: p.subject, name: p.name, headPx: p.headPx, small: p.small, why: p.why, track: readTrack(ctx, r, p.subject) })) : []
  const run = running(FACE_KEY, ctx.l2r.deps.runtime().store, isFaceLabel)
  return { renderId, people, price: facePassCredits(r.frames ?? 49), running: run ? { since: run.since, what: run.what, ...(run.jobId ? { jobId: run.jobId } : {}) } : null, configured }
}

/** POST /face/track: free, the strip */
export async function faceTrackRoute(ctx: FacePassCtx, b: Record<string, unknown>): Promise<{ person: FacePersonView }> {
  const q = body(b)
  const r = findRender(ctx.l2r.publicDir, q.renderId)
  if (!r) throw httpError(404, `no render ${q.renderId}`, 'not_found')
  if (r.status !== 'done' || !r.raw) throw httpError(409, 'this render has no video yet', 'not_finished')
  const take = readTake(ctx.l2r.publicDir, r.takeId)
  const p = take ? (await (ctx.people ?? facePeople)(ctx.l2r.publicDir, take)).find((x) => x.subject === q.subject) : undefined
  if (!p) throw httpError(404, `${q.subject} is not staged in this take`, 'not_found')
  if (!p.color) throw httpError(409, p.why ?? 'not in the ID pass', 'not_fixable')
  const track = await trackFace(ctx, r, p)
  return { person: { subject: p.subject, name: p.name, headPx: p.headPx, small: p.small, why: p.why, track } }
}

/** POST /face: the paid pass; answers with the candidate once its job id is known */
export const faceRunRoute = async (ctx: FacePassCtx, b: Record<string, unknown>) => {
  const q = body(b)
  return { candidate: await startFacePass(ctx, q.renderId, q.subject) }
}
