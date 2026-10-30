// A Cloud job that finishes 'succeeded' with no output files (flagged cloud-jobs): recorded as failed-empty, plain sentence, not charged
// where the balance can tell, never offered Recover, and a retry is a fresh job (one new charge, nothing doubled).
import { describe, expect, it } from 'vitest'
import { recoverJob } from '../recover.ts'
import { runJob } from '../run.ts'
import { EMPTY_MESSAGE, JobError } from '../types.ts'
import { fakeJob, rig } from './rig.ts'

const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as JobError)
const ID = 'aaaaaaaa-0000-4000-8000-000000000001'

describe('empty output guard', () => {
  it('records failed-empty, says the plain sentence, and is not charged when the balance did not move', async () => {
    const t = rig({ jobs: [fakeJob({ outputs: 0 })], balance: async () => 1000 })
    const e = await refusal(runJob(t.rt, t.spec()))
    expect(e).toMatchObject({ code: 'empty', message: EMPTY_MESSAGE })
    expect(e?.jobId).toBeUndefined() // no job id to chase: Recover is not offered
    expect(t.rt.store.list()[0]).toMatchObject({ status: 'failed', empty: true, costCents: 0, saved: [], jobId: ID })
    expect(t.rt.budget.spentToday()).toBe(0)
    expect(t.ledger()).toContain('EMPTY OUTPUT')
  })

  it('keeps the estimate committed and says so when the cost could not be measured', async () => {
    const t = rig({ jobs: [fakeJob({ outputs: 0 })] })
    await refusal(runJob(t.rt, t.spec()))
    expect(t.rt.store.list()[0]).toMatchObject({ status: 'failed', empty: true, costCents: null })
    expect(t.rt.budget.spentToday()).toBe(20)
    expect(t.ledger()).toContain('cost not measured')
  })

  it('charges what the balance says when Cloud billed the empty job', async () => {
    const b = [1000, 990]
    const t = rig({ jobs: [fakeJob({ outputs: 0 })], balance: async () => b.shift() ?? 990 })
    await refusal(runJob(t.rt, t.spec()))
    expect(t.rt.budget.spentToday()).toBe(21.1)
  })

  it('a retry is a new job: one more submit, one more charge, the empty one never resubmitted by itself', async () => {
    const t = rig({ jobs: [fakeJob({ outputs: 0 }), fakeJob({ id: 'bbbbbbbb-0000-4000-8000-000000000002' })], balance: async () => 1000 })
    await refusal(runJob(t.rt, t.spec()))
    expect(t.submits).toBe(1)
    const r = await runJob(t.rt, t.spec())
    expect(r.status).toBe('done')
    expect(t.submits).toBe(2)
  })

  it('Recover of a known-empty record fetches nothing and says the same sentence', async () => {
    const t = rig({ jobs: [fakeJob({ outputs: 0 })] })
    await refusal(runJob(t.rt, t.spec()))
    const rt = t.restart({ getJob: async () => { throw new Error('must not fetch') } })
    expect(await refusal(recoverJob(rt, ID))).toMatchObject({ code: 'empty', message: EMPTY_MESSAGE })
  })

  it('Recover of an id that turns out empty records it failed-empty (no download failure to retry)', async () => {
    const t = rig({ jobs: [fakeJob({ wait: async () => { throw new Error('socket hang up') } })] })
    await refusal(runJob(t.rt, t.spec()))
    const rt = t.restart({ getJob: async (id) => fakeJob({ id, outputs: 0 }) })
    expect(await refusal(recoverJob(rt, ID))).toMatchObject({ code: 'empty' })
    expect(rt.store.list()[0]).toMatchObject({ status: 'failed', empty: true })
  })

  it('a job with files is untouched', async () => {
    const t = rig()
    expect((await runJob(t.rt, t.spec())).status).toBe('done')
  })
})
