// Browser side of "Not responding -> Check / Release" (server/jobs/hang.ts). Free: neither call spends, cancels or resubmits.
import { LIBRARY_ROUTES } from '../shared/libraryContract'
import { libraryReply, type Fetch } from '../library/api'

export interface CheckReply { cloud: string | null; released: boolean; message: string }
export interface ReleaseReply { released: boolean; cloudJobId?: string | null; message: string }
export interface HangApi {
  /** asks Cloud for the job's status by id; a job Cloud already finished or failed stops being waited on */
  check: (scene: string, jobId: string) => Promise<CheckReply>
  /** stops waiting for a job that ran past its limit; the Cloud job stays recoverable */
  release: (scene: string, jobId: string) => Promise<ReleaseReply>
}

const url = (scene: string, jobId: string, act: string) =>
  [LIBRARY_ROUTES.scenes, encodeURIComponent(scene), 'jobs', encodeURIComponent(jobId), act].join('/')

export function hangApi(f: Fetch = (i, init) => fetch(i, init)): HangApi {
  const post = (scene: string, jobId: string, act: string) =>
    f(url(scene, jobId, act), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  return {
    check: async (s, j) => libraryReply<CheckReply>(await post(s, j, 'check')),
    release: async (s, j) => libraryReply<ReleaseReply>(await post(s, j, 'release')),
  }
}
