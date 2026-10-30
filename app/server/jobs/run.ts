/**
 * runJob: the one place a new endpoint spends credits. Order, each step a guard:
 *   1 validate the graph against object_info (refuse, free)   2 bound files exist (refuse, free)
 *   3 day budget: spent-today + estimate <= cap (refuse, free), then the estimate is committed to disk
 *   4 in-flight record `submitting` on disk   5 submit (the only billed call)
 *   6 ledger `submitted` row + record `waiting` with the job id, BEFORE waiting
 *   7 wait, download outputs, re-read the balance after the settle delay -> cost, completion ledger row
 *   8 record `done` / `failed` / `needs-recover`, budget corrected to the measured cost
 * The one automatic resubmit is Cloud's free MTPHead load fault (clip/retry.ts: failed + that error + settled delta 0,
 * <= 3 submissions); every other failure is final and says "recover by id". Jobs run one at a time (Lock).
 */
import { existsSync } from 'node:fs'
import type { Job } from '@comfyorg/sdk'
import { bindFile, toWorkflow } from '../comfy/index.ts'
import { withHint } from '../comfy/errorHints.ts'
import { centsDelta, CREDITS_PER_CENT, redact } from '../stills/ledger.ts'
import { freeHiccup, hiccupLine, MAX_ATTEMPTS, shouldRetry, type AttemptOutcome } from '../clip/retry.ts'
import { jobContext, leftBeforeTurn } from './context.ts'
import { logJobRow } from './ledger.ts'
import { assertValid } from './objinfo.ts'
import { downloadOutputs, outputCount } from './outputs.ts'
import { ReleasedError, waitOrRelease } from './release.ts'
import { newRecordId } from './store.ts'
import { EMPTY_MESSAGE, JobError, type JobRecord, type JobResult, type JobSpec } from './types.ts'
import type { JobRuntime } from './runtime.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const round1 = (n: number) => Math.round(n * 10) / 10
export const creditsOf = (cents: number | null) => (cents === null ? null : round1(cents * CREDITS_PER_CENT))

export function runJob(rt: JobRuntime, spec: JobSpec): Promise<JobResult> {
  // a recorded scene job queued behind another paid job says "waiting" until its turn; the budget is checked when it starts.
  // Until its first paid call takes the runner, a job whose page has gone is dropped (free); after that it is never dropped.
  const job = jobContext()
  const left = leftBeforeTurn(job)
  if (left) return Promise.reject(left)
  if (job && !job.begun && rt.lock.waiting > 0) job.waiting(true)
  return rt.lock.run(() => {
    if (job && !job.begun) {
      job.waiting(false)
      const gone = leftBeforeTurn(job)
      if (gone) return Promise.reject(gone)
      job.begun = true
    }
    return execute(rt, spec)
  })
}

async function execute(rt: JobRuntime, spec: JobSpec): Promise<JobResult> {
  const { deps, store, budget } = rt
  await assertValid(spec.graph, rt.info, spec.allowModels)
  for (const [, , file] of spec.binds ?? []) if (!existsSync(file)) throw new JobError('inputs', `Missing input file: ${file}`, 400)
  budget.check(spec.estimateCredits)
  budget.adjust(spec.estimateCredits) // committed before the billed call; corrected when the cost settles

  const now = new Date().toISOString()
  const rec: JobRecord = store.save({ id: newRecordId(), label: spec.label, status: 'submitting', attempts: [], estimateCredits: spec.estimateCredits,
    costCents: null, costCredits: null, execSeconds: null, outputs: spec.outputs, saved: [], createdAt: now, updatedAt: now, pid: process.pid,
    overlapped: store.open().length > 0 || undefined })
  const workflow = spec.label
  const note = `${spec.note ?? ''}${rec.overlapped ? ' OVERLAPPED: other jobs were in flight, cost may be blurred' : ''}`.trim()
  const fail = (code: 'submit' | 'failed', msg: string, jobId?: string) => new JobError(code, redact(msg), 502, jobId, rec.id)

  for (let attempt = 1; ; attempt++) {
    const wf = toWorkflow(spec.graph)
    for (const [node, field, file] of spec.binds ?? []) (deps.bind ?? bindFile)(wf, node, field, file)
    const before = await deps.balance()
    const t0 = Date.now()
    let job: Job
    try {
      store.save({ ...rec, status: 'submitting' })
      job = await deps.submit(wf) // the billed call; repeated only by the hiccup rule below
    } catch (e) {
      budget.adjust(-spec.estimateCredits) // Cloud never returned a job: nothing is billed
      store.save({ ...rec, status: 'failed', error: redact(`submit failed: ${e instanceof Error ? e.message : String(e)}`).slice(0, 400) })
      throw fail('submit', `submit failed: ${e instanceof Error ? e.message : String(e)}`)
    }

    // The job exists and is billed from here on: ledger row and record before the wait, completion row after it.
    const mark = attempt > 1 ? ` attempt ${attempt}/${MAX_ATTEMPTS}` : ''
    rec.jobId = job.id
    rec.status = 'waiting'
    rec.attempts.push({ jobId: job.id, status: 'submitted', execSeconds: null, deltaCents: null })
    await logJobRow(rt.logPath, { workflow, jobId: job.id, status: 'submitted',
      note: `${note}${mark} (awaiting result; no completion row below = recover by id, do not resubmit)` })
    store.save(rec)
    jobContext()?.cloud?.(job.id) // the scene job's record learns the Cloud id (Check looks it up; Release keeps it recoverable)

    let status = 'unknown'
    let failure: unknown
    try { await waitOrRelease(job.wait(spec.timeoutMs ?? 30 * 60_000), jobContext()); status = job.status } catch (e) { failure = e; status = 'wait-error' }
    const execMs = job.metrics?.execution_ms
    const execSeconds = typeof execMs === 'number' ? execMs / 1000 : null
    const dl = status === 'succeeded' ? await downloadOutputs(job, spec.outputs).catch((e) => ({ saved: [] as string[], failed: [String(e)] })) : { saved: [], failed: [] }
    await sleep(deps.settleMs)
    const deltaCents = centsDelta(before, await deps.balance())
    const wall = Math.round((Date.now() - t0) / 100) / 10
    const err = status === 'succeeded' ? '' : ` ERROR: ${JSON.stringify(job.error ?? String(failure ?? '')).slice(0, 300)}`
    // Cloud says succeeded but made no file at all: nothing to download, nothing to recover - a failed job, not a lost one
    const empty = status === 'succeeded' && outputCount(job, spec.outputs) === 0
    const dlNote = empty ? ` EMPTY OUTPUT (job ${job.id} succeeded with no files; nothing to recover${deltaCents === null ? '; cost not measured, estimate kept' : ''})`
      : dl.failed.length ? ` DOWNLOAD FAILED (recover by id ${job.id}): ${dl.failed.join(', ')}` : ''
    await logJobRow(rt.logPath, { workflow, jobId: job.id, status, wallSeconds: wall, execSeconds, deltaCents, note: note + mark + err + dlNote })
    Object.assign(rec.attempts[rec.attempts.length - 1], { status, execSeconds, deltaCents })

    if (empty) {
      // the balance delta says what it cost (0 = not charged); with no balance to read the estimate stays committed and the record says so
      Object.assign(rec, { status: 'failed', empty: true, costCents: deltaCents, costCredits: creditsOf(deltaCents), execSeconds, saved: [], error: EMPTY_MESSAGE })
      if (deltaCents !== null) budget.adjust(creditsOf(deltaCents)! - spec.estimateCredits)
      store.save(rec)
      throw new JobError('empty', EMPTY_MESSAGE, 502, undefined, rec.id)
    }

    if (status === 'succeeded' && dl.failed.length === 0) {
      Object.assign(rec, { status: 'done', costCents: deltaCents, costCredits: creditsOf(deltaCents), execSeconds, saved: dl.saved })
      if (deltaCents !== null) budget.adjust(creditsOf(deltaCents)! - spec.estimateCredits)
      store.save(rec)
      return { id: rec.id, jobId: job.id, status: 'done', attempts: attempt, costCents: deltaCents, costCredits: rec.costCredits, execSeconds, saved: dl.saved }
    }

    const outcome: AttemptOutcome = { status, error: job.error ?? null, deltaCents, execSeconds, outputs: outputCount(job, spec.outputs) }
    if (shouldRetry(outcome, attempt)) {
      store.save({ ...rec, error: `${hiccupLine(attempt + 1)} (free: 0 credits)` })
      await sleep(deps.retryMs)
      continue
    }
    // Final. A lost wait or a failed download may still be recoverable by id; a Cloud failure is over.
    const recoverable = status === 'wait-error' || status === 'succeeded'
    const why = failure instanceof ReleasedError ? `job ${job.id} ${failure.message}`
      : status === 'succeeded' ? `job ${job.id} succeeded but its download failed (${dl.failed.join(', ')}); recover by id, do not resubmit${deltaCents !== null ? ` (billed ${creditsOf(deltaCents)} cr)` : ''}`
      : `job ${job.id} ${status} - look it up by id, do not resubmit.${err}${freeHiccup(outcome) ? ` (Cloud hiccup on all ${MAX_ATTEMPTS} attempts)` : ''}`
    Object.assign(rec, { status: recoverable ? 'needs-recover' : 'failed', costCents: deltaCents, costCredits: creditsOf(deltaCents), execSeconds, saved: dl.saved, error: redact(why).slice(0, 600) })
    if (status !== 'wait-error' && deltaCents !== null) budget.adjust(creditsOf(deltaCents)! - spec.estimateCredits)
    store.save(rec)
    throw fail('failed', status === 'succeeded' ? why : withHint(why), job.id)
  }
}
