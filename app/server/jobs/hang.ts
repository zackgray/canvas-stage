/**
 * "Not responding -> Check / Release" for a running scene job (POST /__lab/scenes/<id>/jobs/<jobId>/check | release).
 *  - check: asks Cloud for the status of the press's job BY ID (the same lookup Recover uses, without Recover's wait, so it neither
 *    queues behind the stuck job nor holds the runner). Cloud saying it finished or failed means the wait will never return on its
 *    own, so the wait is released; Cloud saying it still runs changes nothing.
 *  - release: stops waiting (jobs/release.ts). Refused for a job that has not run past its kind's limit (a stray click cannot cut a
 *    healthy job loose) and for one still queued (nothing is spent while it waits; closing the tab drops it).
 * Neither cancels, resubmits or settles anything: the Cloud job id stays on the record and Recover fetches the result. Free.
 */
import { hangLimitMs, isHung } from '../../src/jobs/hangLimits.ts'
import type { JobRecords } from '../scene/jobRecords.ts'
import { redact } from '../stills/ledger.ts'
import { fireRelease, releaseKey } from './release.ts'
import type { JobRuntime } from './runtime.ts'

export interface HangReply { status: number; body: unknown }
const TERMINAL = ['succeeded', 'failed', 'cancelled', 'canceled']
const STILL_BILLS = 'It may still finish and bill. Recover fetches it by id; nothing is sent again.'

/** stops waiting for the job; false (nothing changed) when it is not running */
function stopWaiting(jobs: JobRecords, scene: string, id: string): boolean {
  const r = jobs.raw(scene, id)
  if (!r || r.status !== 'running') return false
  const { ends } = fireRelease(releaseKey({ scene, id }))
  if (!ends) jobs.markReleased(scene, id) // nothing will end the route by itself: the record says so
  return true
}

export function releaseHung(jobs: JobRecords, scene: string, id: string, now = Date.now()): HangReply {
  const r = jobs.raw(scene, id)
  if (!r) return { status: 404, body: { error: 'no such job' } }
  if (r.status !== 'running') return { status: 200, body: { released: false, message: 'It is not running any more.' } }
  if (r.waiting) return { status: 409, body: { error: 'It is still waiting its turn behind another job, so nothing is spent. Close the tab to drop it.' } }
  if (!isHung(r, now)) return { status: 409, body: { error: `It has not run longer than a ${r.intent} job takes (${Math.round(hangLimitMs(r.intent) / 60_000)} min), so it is not released.` } }
  stopWaiting(jobs, scene, id)
  return { status: 200, body: { released: true, cloudJobId: r.cloudJobId ?? null, message: `Released: other jobs can go now. ${STILL_BILLS}` } }
}

export async function checkHung(jobs: JobRecords, rt: JobRuntime, scene: string, id: string): Promise<HangReply> {
  const r = jobs.raw(scene, id)
  if (!r) return { status: 404, body: { error: 'no such job' } }
  if (r.status !== 'running') return { status: 200, body: { cloud: null, released: false, message: 'It is not running any more.' } }
  if (!r.cloudJobId) return { status: 200, body: { cloud: null, released: false, message: 'Nothing has been sent to Cloud for it yet, so there is nothing to look up.' } }
  let status: string
  try { status = (await rt.deps.getJob(r.cloudJobId)).status } catch (e) {
    return { status: 502, body: { error: redact(`Could not reach Cloud for job ${r.cloudJobId}: ${e instanceof Error ? e.message : String(e)}`) } }
  }
  if (!TERMINAL.includes(status)) return { status: 200, body: { cloud: status, released: false, message: `Cloud says it is still ${status}. Keep waiting, or Release to let other jobs go.` } }
  const released = stopWaiting(jobs, scene, id)
  return { status: 200, body: { cloud: status, released, message: `Cloud says it ${status === 'succeeded' ? 'finished' : status}; no longer waiting for it. Recover fetches it by id.` } }
}
