/**
 * recoverJob: fetch an EXISTING Cloud job by id and write its outputs. It never submits (the runtime's `submit` is not
 * reachable from here), so it cannot bill. If the job is still running it waits for it; a finished job's outputs are
 * downloaded to the targets on its in-flight record (or `outputs` for an id only the ledger knows). Cost stays what the
 * record settled; a lost wait leaves it unmeasured and the budget keeps the estimate.
 */
import { redact } from '../stills/ledger.ts'
import { logJobRow } from './ledger.ts'
import { downloadOutputs, outputCount } from './outputs.ts'
import type { JobRuntime } from './runtime.ts'
import { EMPTY_MESSAGE, JobError, type JobRecord, type OutputTarget } from './types.ts'

const TERMINAL = ['succeeded', 'failed', 'cancelled', 'canceled']

export interface RecoverResult { jobId: string; status: string; saved: string[]; record: JobRecord | null }

export function recoverJob(rt: JobRuntime, jobId: string, outputs?: Record<string, OutputTarget>, timeoutMs = 30 * 60_000): Promise<RecoverResult> {
  if (!/^[\w-]{8,64}$/.test(jobId)) return Promise.reject(new JobError('recover', 'bad job id', 400))
  return rt.lock.run(async () => {
    const rec = rt.store.byJobId(jobId) ?? null
    if (rec?.empty) throw new JobError('empty', EMPTY_MESSAGE, 409, undefined, rec.id) // already known empty: nothing to fetch
    let job
    try { job = await rt.deps.getJob(jobId) } catch (e) { throw new JobError('recover', redact(`could not fetch job ${jobId}: ${e instanceof Error ? e.message : String(e)}`), 502, jobId) }
    if (!TERMINAL.includes(job.status)) { try { await job.wait(timeoutMs) } catch { /* reported by the status below */ } }
    const targets = rec?.outputs ?? outputs
    const base = { workflow: rec?.label ?? 'recovered', jobId, wallSeconds: undefined }
    if (job.status !== 'succeeded') {
      const msg = `job ${jobId} is ${job.status}${job.status === 'failed' ? ` - ${JSON.stringify(job.error ?? '').slice(0, 300)}` : ' - not finished; try again later'}`
      await logJobRow(rt.logPath, { ...base, status: `recover-${job.status}`, note: 'recovered by id (no submit)' })
      if (rec && job.status === 'failed') rt.store.save({ ...rec, status: 'failed', error: redact(msg).slice(0, 600), recovered: true })
      throw new JobError('recover', redact(msg), 409, jobId, rec?.id)
    }
    if (!targets) throw new JobError('recover', `job ${jobId} succeeded but no record says where its outputs go; pass "outputs"`, 400, jobId)
    if (outputCount(job, targets) === 0) {
      await logJobRow(rt.logPath, { ...base, status: 'recover-empty', note: 'recovered by id (no submit): succeeded with no output files' })
      if (rec) rt.store.save({ ...rec, status: 'failed', empty: true, error: EMPTY_MESSAGE, recovered: true })
      throw new JobError('empty', EMPTY_MESSAGE, 409, undefined, rec?.id)
    }
    const dl = await downloadOutputs(job, targets)
    const ok = dl.failed.length === 0
    await logJobRow(rt.logPath, { ...base, status: ok ? 'recovered' : 'recover-download-failed', note: `recovered by id (no submit)${ok ? '' : ` DOWNLOAD FAILED: ${dl.failed.join(', ')}`}` })
    const record = rec ? rt.store.save({ ...rec, status: ok ? 'done' : 'needs-recover', saved: dl.saved, recovered: true,
      execSeconds: rec.execSeconds ?? (typeof job.metrics?.execution_ms === 'number' ? job.metrics.execution_ms / 1000 : null), error: ok ? undefined : `download failed: ${dl.failed.join(', ')}` }) : null
    if (!ok) throw new JobError('recover', `job ${jobId} succeeded but the download failed (${dl.failed.join(', ')}); try Recover again`, 502, jobId, rec?.id)
    return { jobId, status: 'recovered', saved: dl.saved, record }
  })
}
