/**
 * The one failure the clip runner resubmits on its own: Cloud's intermittent LTX model-load fault, which fails node 13
 * (VAELoader) with "cannot unpack non-iterable MTPHead object" ~1.3 s in and bills nothing (13 times in E24/E27, all
 * 0 credits). Policy: the job FAILED, its error is exactly that signature, and it cost nothing (the settled ledger
 * delta is 0; with no balance to read, it ran < 3 s and produced no output) -> wait ~2 min, resubmit, at most
 * MAX_ATTEMPTS submissions in all. Anything else (a billed failure, a timeout or lost wait, a download failure, any
 * other error) is never retried: a resubmit there is a second billed job. Pure; run.ts applies it.
 */

export const MAX_ATTEMPTS = 3
export const RETRY_WAIT_MS = 120_000
/** No balance to read: a hiccup is only trusted as free if it died this fast with nothing out. */
export const FREE_EXEC_S = 3

/** The UI's line while a hiccup is being retried (attempt = the one about to run / running). */
export const hiccupLine = (attempt: number) => `Cloud hiccup — retrying (${attempt}/${MAX_ATTEMPTS})`

/** Cloud's job error (an object, or its JSON text) is the VAELoader / MTPHead fault. */
export function isCloudHiccup(error: unknown): boolean {
  let e = error
  if (typeof e === 'string') { try { e = JSON.parse(e) } catch { return false } }
  if (!e || typeof e !== 'object') return false
  const { class_type, message } = e as { class_type?: unknown; message?: unknown }
  return class_type === 'VAELoader' && typeof message === 'string' && message.includes('cannot unpack non-iterable MTPHead object')
}

export interface AttemptOutcome {
  /** job.status after the wait ('wait-error' when the wait itself threw) */
  status: string
  error: unknown
  /** settled cost of this attempt in cents (null = no balance to read) */
  deltaCents: number | null
  execSeconds: number | null
  outputs: number
}

/** This failed attempt was the free hiccup: safe to submit again (the cap on attempts is the caller's). */
export function freeHiccup(o: AttemptOutcome): boolean {
  if (o.status !== 'failed' || !isCloudHiccup(o.error)) return false
  if (o.deltaCents !== null) return o.deltaCents === 0
  return o.execSeconds !== null && o.execSeconds < FREE_EXEC_S && o.outputs === 0
}

/** Submit again after attempt `attempt` (1-based) failed this way. */
export const shouldRetry = (o: AttemptOutcome, attempt: number) => attempt < MAX_ATTEMPTS && freeHiccup(o)
