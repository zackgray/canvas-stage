/**
 * The scene job a request is (server/scene/jobRecords.ts captureJobs): a press the page's job store named and recorded before the
 * route saw it. Carried with the request's async work (AsyncLocalStorage), so the runner and the sections it passes through know
 * the job without every route passing it on. A recorded job WAITS its turn behind another paid job (any scene, any section) instead
 * of being refused, and says so on its record; a call without one (scripts, tests, an old page) keeps the sections' refusals.
 * A job still waiting when its page goes away (tab closed, reload: the request closed) is dropped before it claims its section or
 * the runner's lock: a free refusal, nothing submitted. Once its first job is submitted it runs to the end whatever the page does.
 * Pinned on globalThis like the lock and the claims: Vite's in-process restart re-bundles this module while requests are in flight.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { JobError } from './types.ts'

export interface JobContext {
  scene: string
  id: string
  intent: string
  target: string
  /** the job is queued behind another paid job (true) or has its turn now (false); written to its record */
  waiting: (on: boolean) => void
  /** the page that sent it is gone: its request closed before the reply was written */
  gone: () => boolean
  /** the runner submitted a billed Cloud job for this press: its id goes on the record (what Check looks up and Recover fetches) */
  cloud?: (cloudJobId: string) => void
  /** set when the job's first paid call takes the runner: from then on it is never dropped */
  begun?: boolean
}

const KEY = Symbol.for('canvas-stage.jobs.context')
const als = (): AsyncLocalStorage<JobContext> =>
  ((globalThis as Record<symbol, AsyncLocalStorage<JobContext> | undefined>)[KEY] ??= new AsyncLocalStorage<JobContext>())

/** the recorded job this request is, or null */
export const jobContext = (): JobContext | null => als().getStore() ?? null

/** runs `fn` (and every async step it starts) as the job `ctx` */
export const withJobContext = <T>(ctx: JobContext, fn: () => T): T => als().run(ctx, fn)

/** how often a queued job looks again whether its section is free */
export const QUEUE_POLL_MS = 250

export const LEFT_BEFORE_TURN = 'Not started: the page was closed or reloaded before its turn came, so nothing was spent. Press again to queue it.'

/** the free refusal for a job whose page left before anything of it began, else null */
export const leftBeforeTurn = (job: JobContext | null): JobError | null =>
  job && !job.begun && job.gone() ? new JobError('left', LEFT_BEFORE_TURN, 409) : null
