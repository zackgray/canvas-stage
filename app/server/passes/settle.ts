/**
 * The one restart settle for every pass (the face pass, the still's face and prop redraws). A candidate is written 'running' BEFORE
 * its job is submitted, so a process that dies in between (Ctrl-C during the uploads, a crash) leaves 'running' with no job id: no
 * button, Discard refuses, and the pass's own guard ("one is running") would block that target for good. On every list: the
 * runner's record for its label gives the job id (it was sent); no record and nothing in flight in this process means it never
 * reached Cloud, so it becomes 'failed' (nothing billed, free to press again; Discard clears it). Each pass registers its
 * PassSettler (registry.ts).
 */
import type { PassCandidate } from '../../src/shared/passContract.ts'
import { claimOf, isLive } from '../jobs/index.ts'
import { settlerOf } from './registry.ts'
import { failCandidate, setCandidateJob } from './store.ts'

/** a 'running' candidate with no job id: its id from the runner, left alone while this process may still send it, else failed (free) */
export async function settleRunning(publicDir: string, c: PassCandidate): Promise<PassCandidate> {
  const s = settlerOf(c.pass)
  // this process holds the pass's section: it may be between the candidate and the submit, and writes the job id itself (two
  // writers of one file fail on Windows)
  if (!s || c.state !== 'running' || c.jobId || s.active?.(c) || claimOf(s.key)) return c
  const rec = s.store().list().find((j) => j.label === s.label(c))
  if (rec?.jobId) return setCandidateJob(publicDir, c, rec.jobId)
  if (rec && isLive(rec)) return c // a live process is submitting it
  // no record: it stopped before the runner, so nothing was sent. A record a dead process left mid-send: Cloud may have the job, but
  // with no id there is nothing to recover; say so rather than hold the target for good
  return failCandidate(publicDir, c, rec && rec.status !== 'failed' ? SEND_INTERRUPTED : s.interrupted) // a failed submit returned no job: not billed
}

export const SEND_INTERRUPTED = 'The dev server stopped while this was being sent to Cloud, before Cloud answered with a job id: it may or may not have been billed, and without an id it cannot be recovered. Check the Comfy job history before pressing again.'

export async function settleAll(publicDir: string, cs: PassCandidate[]): Promise<PassCandidate[]> {
  const out: PassCandidate[] = []
  for (const c of cs) out.push(await settleRunning(publicDir, c))
  return out
}
