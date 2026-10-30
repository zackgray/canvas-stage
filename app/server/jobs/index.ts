/**
 * THE JOB RUNNER — every paid Cloud call from a new endpoint goes through here. Call contract (Wave 1 builds on this):
 *
 *   import { jobRuntime, runJob, JobError } from '../jobs/index.ts'
 *
 *   const result = await runJob(jobRuntime(), {
 *     graph,                       // API-format graph (ApiGraph); validated against Cloud object_info first
 *     label: 'perform_take …',     // ledger "workflow" column + jobs list
 *     estimateCredits: 20,         // what you expect it to cost; refused if spent-today + estimate > CANVAS_DAY_BUDGET
 *     outputs: { '13': { dir: absDir, name: 'take-1' } },   // output node id -> files written as <dir>/<name>[-i].<ext>
 *     binds: [['5', 'image', absPng]],   // optional: local files uploaded into loader inputs; must exist
 *     allowModels: ['my-lora.safetensors'],   // optional: per-user models not in shared object_info
 *     note: 'free text',           // optional ledger note
 *   })
 *   // -> { id, jobId, status: 'done', attempts, costCents, costCredits, execSeconds, saved: [absPaths] }
 *
 * Guarantees:
 *  - Nothing is submitted unless the graph validates, the bound files exist and the day budget has room (all free
 *    refusals, thrown as JobError with an HTTP `status`: 400 invalid/inputs, 429 budget, 503 no budget set / no
 *    object_info). No CANVAS_DAY_BUDGET means NO spending: it is refused, never defaulted.
 *  - The ledger `submitted` row (job id) and the on-disk in-flight record are written BEFORE the wait; the budget is
 *    committed before submit and corrected to the measured cost (balance delta ~20 s after completion; exec seconds
 *    are recorded too). Budget and records survive a restart (app/experiments/jobs/).
 *  - One submission per call, except Cloud's free MTPHead load fault (0 credits by balance delta, <= 3 submissions).
 *    Anything else fails with a JobError whose message says "recover by id" and carries `jobId` / `recordId`.
 *  - Jobs run one at a time process-wide (the lock, pinned on globalThis so a Vite restart keeps it) so balance deltas
 *    stay clean; calls queue. A section that must REFUSE a second job (not queue it) wraps its call in
 *    exclusive(key, what, store, labelMatch, fn) and reports running(...) in its GET (inflight.ts): both survive a restart.
 *    A press the page's job store recorded (context.ts) is never refused for another job: it queues, its record says
 *    "waiting", and its price and the day budget are checked when its turn comes.
 *  - recoverJob(jobRuntime(), jobId) fetches an existing job and downloads its outputs; it never submits.
 * Your endpoint: guard with refuseForeign (server/guard.ts), map JobError.status to the HTTP code, and keep its own
 * input checks BEFORE calling runJob. Tests: createRuntime + fake deps (see server/jobs/__tests__/rig.ts), no network.
 */
export { runJob, creditsOf } from './run.ts'
export { recoverJob } from './recover.ts'
export { jobRuntime, createRuntime, setJobRuntime, realJobDeps, type JobRuntime } from './runtime.ts'
export { Budget, parseCap } from './budget.ts'
export { JobStore } from './store.ts'
export { jobContext, LEFT_BEFORE_TURN, withJobContext, type JobContext } from './context.ts'
export { BusyError, claimOf, exclusive, isLive, pidAlive, running, type Running, type Section } from './inflight.ts'
export {
  EMPTY_MESSAGE, FREE_CODES, isFreeRefusal, JobError, OPEN,
  type JobSpec, type JobResult, type JobRecord, type JobDeps, type OutputTarget, type JobStatus, type JobErrorCode,
} from './types.ts'
