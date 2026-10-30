// Review F11: Recover was offered only when the newest render was the failed one, so a paid render that never came back was lost
// to the UI as soon as a later press worked. Any failed render with a job id and no video is recoverable (free, by id, never resubmitted).
import { describe, expect, it } from 'vitest'
import type { L2RRender } from '../../shared/shotContract'
import { lostRender } from './l2rModel'
import type { L2RState } from './l2rStore'

const r = (id: string, over: Partial<L2RRender> = {}): L2RRender => ({ id, takeId: 'take-1', stillId: 's', clay: '/c.mp4', raw: '/raw.mp4', finished: '/fin.mp4', jobId: `job-${id}`, credits: 21, status: 'done', ...over })
const st = (renders: L2RRender[]) => ({ status: { renders } }) as unknown as L2RState
const lost = { status: 'failed' as const, raw: null, finished: null }

describe('Recover for any failed paid render', () => {
  it('a failed render under a newer done one is still offered', () => {
    expect(lostRender(st([r('l2r-2'), r('l2r-1', lost)]))?.id).toBe('l2r-1')
  })
  it('the newest failed one first; none without a job id, none interrupted before Cloud, none with its video back', () => {
    expect(lostRender(st([r('l2r-3', lost), r('l2r-2', lost)]))?.id).toBe('l2r-3')
    expect(lostRender(st([r('l2r-2'), r('l2r-1', { ...lost, jobId: null })]))).toBeNull()
    expect(lostRender(st([r('l2r-1', { ...lost, interrupted: true })]))).toBeNull()
    expect(lostRender(st([r('l2r-1', { status: 'failed', blank: true })]))).toBeNull() // a blank raw came back: billed, filed failed, nothing to fetch
    expect(lostRender(st([r('l2r-1')]))).toBeNull()
  })
})
