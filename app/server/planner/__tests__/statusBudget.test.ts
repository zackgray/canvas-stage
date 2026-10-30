// The planner's status carries today's budget (a local read, no Cloud call) so the front door's Develop it can say before the press
// that the day budget would refuse it; the client's idea cap is the route's own.
import { afterEach, describe, expect, it } from 'vitest'
import type { PlannerStatus } from '../../../src/shared/bibleContract.ts'
import { IDEA_MAX } from '../../../src/studio/scene/design/model.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { INPUT } from '../routes.ts'
import { GOOD_PLAN, setup } from './rig.ts'

afterEach(() => resetClaims())

describe('GET /__lab/planner: the budget', () => {
  it('says the cap and what is left, and what is left falls after a billed press', async () => {
    const s = setup({ cap: 100 })
    expect(((await s.get()).body as PlannerStatus).budget).toEqual({ cap: 100, remaining: 100 })
    s.answers.push({ p0: GOOD_PLAN })
    expect((await s.call('/plan', { prompt: 'A' })).status).toBe(200)
    const left = ((await s.get()).body as PlannerStatus).budget!
    expect(left.cap).toBe(100)
    expect(left.remaining).toBe(100 - s.rt.budget.spentToday())
    expect(left.remaining).toBeLessThan(100)
  })
  it('no cap set: cap and remaining are null (every paid press is refused)', async () => {
    expect(((await setup({ cap: null }).get()).body as PlannerStatus).budget).toEqual({ cap: null, remaining: null })
  })
  it('the client refuses the same length of idea the route does', () => {
    expect(IDEA_MAX).toBe(INPUT.idea)
  })
})
