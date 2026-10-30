/**
 * The panel's view of the in-flight make: the box's job status when the box answers, or the plan-1.4 bookkeeping when
 * it does not — polls failing for more than lostAfterMs -> stage lost ("It may still finish.", Check again re-attaches),
 * the job running past its budget -> failed ("The motion computer stalled.", partial tries kept on the box).
 */
import { boxJob, type BoxTarget } from './box.ts'
import type { MotionStore } from './store.ts'
import type { BoxJobStatus, BoxStage, InFlight } from './types.ts'

const TERMINAL = ['done', 'failed', 'cancelled']

/** the motion box reports its progress inside the stage ("generating 3/4"): the stage is the first word */
export const stageOf = (raw: string): BoxStage => (String(raw).trim().split(/\s+/)[0] || 'encoding') as BoxStage

export type JobView = Omit<BoxJobStatus, 'stage'> & { stage: BoxJobStatus['stage'] | 'lost'; /** ms epoch the make started */ startedAt: number }

export async function jobView(target: BoxTarget | null, store: MotionStore, rec: InFlight, lostAfterMs: number, jobBudgetMs: number): Promise<JobView> {
  if (target && !TERMINAL.includes(rec.stage)) {
    try {
      const status = await boxJob(target, rec.jobId)
      const stage = stageOf(status.stage)
      rec.stage = stage
      rec.message = status.message
      rec.lastOk = Date.now()
      // a finished make's tries are kept in the record: read again later (a reload, the person picked again) they are still there
      if (TERMINAL.includes(stage)) rec.result = { done: status.done, of: status.of, round: status.round, tries: status.tries, dropped: status.dropped }
      await store.saveInFlight(rec)
      return { ...status, stage, startedAt: rec.createdAt }
    } catch {
      if (Date.now() - rec.lastOk > lostAfterMs) {
        rec.stage = 'lost'
        rec.message = 'Lost contact with the motion computer. It may still finish.'
        await store.saveInFlight(rec)
      }
    }
  }
  if (!TERMINAL.includes(rec.stage) && Date.now() - rec.createdAt > jobBudgetMs) {
    rec.stage = 'failed'
    rec.message = 'The motion computer stalled.'
    await store.saveInFlight(rec)
  }
  return { id: rec.jobId, stage: rec.stage, done: 0, of: rec.n, round: 1, tries: [], dropped: { count: 0, reason: '' }, ...rec.result, startedAt: rec.createdAt, ...(rec.message ? { message: rec.message } : {}) }
}
