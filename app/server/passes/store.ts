/**
 * Pass candidates on disk, next to the take's other files: public/lab-assets/shots/<takeId>/passes/<id>.json (one file each,
 * written whole through a temp name). A candidate exists from the moment its paid job is submitted ('running', with the job id
 * and price), so a reload finds it and recovers it by id instead of resubmitting. Nothing here submits.
 */
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { PassBox, PassCandidate, PassKind, PassTarget } from '../../src/shared/passContract.ts'
import { SHOTS_DIR } from '../../src/shared/shotContract.ts'
import { HeroHttpError, readJson, takeIdOf, writeJson } from '../hero/store.ts'
import { applierOf, type PassCtx, type PassRecovered } from './registry.ts'

export const PASS_ID_RE = /^pass-[\w-]{1,64}$/
export const passesDirOf = (publicDir: string, takeId: string) => path.join(publicDir, SHOTS_DIR, takeId, 'passes')
const fileOf = (publicDir: string, takeId: string, id: string) => path.join(passesDirOf(publicDir, takeId), `${id}.json`)

export interface NewCandidate { takeId: string; pass: PassKind; target: PassTarget; subject: string; box: PassBox; beforeUrl: string; beforeCropUrl?: string | null; jobId?: string | null; costCredits?: number | null }

let chain: Promise<unknown> = Promise.resolve()
/** decisions run one at a time, so a double press cannot apply twice */
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const next = chain.then(fn, fn); chain = next.catch(() => {}); return next }

const save = (publicDir: string, c: PassCandidate) => writeJson(fileOf(publicDir, c.takeId, c.id), c)

export async function createCandidate(publicDir: string, n: NewCandidate, now = new Date()): Promise<PassCandidate> {
  takeIdOf(n.takeId)
  const id = `pass-${now.toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`
  const c: PassCandidate = { id, takeId: n.takeId, pass: n.pass, target: n.target, subject: n.subject, box: n.box, state: 'running',
    beforeUrl: n.beforeUrl, afterUrl: null, beforeCropUrl: n.beforeCropUrl ?? null, afterCropUrl: null, jobId: n.jobId ?? null, costCredits: n.costCredits ?? null, createdAt: now.toISOString() }
  await save(publicDir, c)
  return c
}

/** the candidate by id and take (the files live under the take) */
export async function readCandidate(publicDir: string, takeId: string, id: string): Promise<PassCandidate> {
  if (!PASS_ID_RE.test(id)) throw new HeroHttpError(400, 'id must be a pass-… id', 'bad_request')
  const c = await readJson<PassCandidate>(fileOf(publicDir, takeId, id))
  if (!c || c.id !== id) throw new HeroHttpError(404, `${id} is not a pass candidate of ${takeId}`, 'not_found')
  return c
}

/** a decision names only the id, so find it by scanning the takes that have a passes/ folder */
export async function findCandidate(publicDir: string, id: string): Promise<PassCandidate> {
  if (!PASS_ID_RE.test(id)) throw new HeroHttpError(400, 'id must be a pass-… id', 'bad_request')
  const root = path.join(publicDir, SHOTS_DIR)
  if (existsSync(root)) for (const t of await readdir(root)) {
    if (existsSync(path.join(root, t, 'passes', `${id}.json`))) return readCandidate(publicDir, t, id)
  }
  throw new HeroHttpError(404, `${id} is not a pass candidate`, 'not_found')
}

export async function listCandidates(publicDir: string, takeId: string): Promise<PassCandidate[]> {
  takeIdOf(takeId)
  const dir = passesDirOf(publicDir, takeId)
  if (!existsSync(dir)) return []
  const out: PassCandidate[] = []
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue
    const c = await readJson<PassCandidate>(path.join(dir, f))
    if (c?.id) out.push(c)
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * The job id onto a running (or failed) candidate as soon as the runner knows it, so a reload recovers it by id. The one writer for
 * it (createCandidate takes a jobId only up front, before the job exists): the face pass and the still redraws both call this.
 */
export async function setCandidateJob(publicDir: string, c: PassCandidate, jobId: string): Promise<PassCandidate> {
  const now = await readCandidate(publicDir, c.takeId, c.id)
  if (now.jobId || (now.state !== 'running' && now.state !== 'failed')) return now // the store's own write already said more
  const next = { ...now, jobId }
  await save(publicDir, next)
  return next
}

/** the before crop of a running candidate, written once its files exist (they are named by the candidate's id) */
export async function setBeforeCrop(publicDir: string, c: PassCandidate, beforeCropUrl: string): Promise<PassCandidate> {
  const next = { ...await readCandidate(publicDir, c.takeId, c.id), beforeCropUrl }
  await save(publicDir, next)
  return next
}

/** the paid job landed: the candidate now has its after. Running or failed (a recovered job) both complete. */
export async function completeCandidate(publicDir: string, c: PassCandidate, r: PassRecovered): Promise<PassCandidate> {
  const done: PassCandidate = { ...c, state: 'candidate', afterUrl: r.afterUrl, beforeCropUrl: r.beforeCropUrl ?? c.beforeCropUrl, afterCropUrl: r.afterCropUrl ?? null,
    costCredits: r.costCredits ?? c.costCredits, error: undefined }
  await save(publicDir, done)
  return done
}

/** the job failed. The job id stays, so a billed failure can still be recovered by id. */
export async function failCandidate(publicDir: string, c: PassCandidate, error: string): Promise<PassCandidate> {
  const failed: PassCandidate = { ...c, state: 'failed', error: error.slice(0, 600) }
  await save(publicDir, failed)
  return failed
}

const refuse = (status: number, message: string, code: string) => new HeroHttpError(status, message, code)

/** Discard: free, changes nothing but the candidate's state. Discarding twice is the same answer. A failed one with no job id
 *  (it never reached Cloud) clears too; a billed failure keeps its job id for Recover and is refused. */
export const discardCandidate = (publicDir: string, id: string): Promise<PassCandidate> => serial(async () => {
  const c = await findCandidate(publicDir, id)
  if (c.state === 'discarded') return c
  if (c.state !== 'candidate' && !(c.state === 'failed' && !c.jobId)) throw refuse(409, `this pass is ${c.state}; only a finished candidate can be discarded`, 'not_candidate')
  const next: PassCandidate = { ...c, state: 'discarded' }
  await save(publicDir, next)
  return next
})

/** Keep: the applier makes the result the approved image/render. Refused unless the candidate is waiting and its target is still the one the pass started from. */
export const keepCandidate = (publicDir: string, id: string): Promise<PassCandidate> => serial(async () => {
  const c = await findCandidate(publicDir, id)
  if (c.state === 'kept') return c // idempotent: a second press changes nothing
  if (c.state !== 'candidate' || !c.afterUrl) throw refuse(409, `this pass is ${c.state}; only a finished candidate can be kept`, 'not_candidate')
  const applier = applierOf(c.target.kind)
  if (!applier) throw refuse(501, `nothing applies a ${c.target.kind} result yet`, 'no_applier')
  const ctx: PassCtx = { publicDir }
  const now = await applier.current(c.target, ctx, c)
  if (now !== c.beforeUrl) throw refuse(409, 'the image changed since this pass started; discard it and run the pass again', 'target_changed')
  const { replacedUrl } = await applier.apply(c, ctx)
  const next: PassCandidate = { ...c, state: 'kept', replacedUrl }
  await save(publicDir, next)
  return next
})
