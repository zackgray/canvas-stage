import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recoverJob } from '../recover.ts'
import { runJob } from '../run.ts'
import { JobError, type JobRecord } from '../types.ts'
import { fakeJob, HICCUP, rig } from './rig.ts'

const records = (dir: string): JobRecord[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith('job-')).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as JobRecord) : []
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as JobError)

describe('runJob: the order of things', () => {
  it('settles cost from the balance delta, logs both ledger rows and corrects the budget to the measured cost', async () => {
    const b = [1000, 990]
    const t = rig({ balance: async () => b.shift() ?? 990 })
    const r = await runJob(t.rt, t.spec())
    expect(r).toMatchObject({ status: 'done', costCents: 10, costCredits: 21.1, execSeconds: 12 })
    expect(t.ledger()).toMatch(/\| JOB \| test-job \| aaaaaaaa-0000-4000-8000-000000000001 \| submitted \|/)
    expect(t.ledger()).toMatch(/\| succeeded \| .* \| 12 \| 10 \| 21 \|/)
    expect(t.rt.budget.spentToday()).toBe(21.1) // the estimate (20) was corrected to the measured cost
    expect(readFileSync(r.saved[0], 'utf8')).toBe('png')
    expect(t.rt.store.list()[0]).toMatchObject({ status: 'done', costCents: 10 })
  })

  it('has job id in ledger and record on disk while the wait is still pending', async () => {
    let ledgerAtWait = ''
    let recAtWait: JobRecord | undefined
    const ref: { t?: ReturnType<typeof rig> } = {}
    const job = fakeJob({ wait: async () => { ledgerAtWait = ref.t!.ledger(); recAtWait = records(ref.t!.dir)[0] } })
    ref.t = rig({ jobs: [job] })
    await runJob(ref.t.rt, ref.t.spec())
    expect(ledgerAtWait).toContain('aaaaaaaa-0000-4000-8000-000000000001 | submitted')
    expect(recAtWait?.status).toBe('waiting')
    expect(recAtWait?.jobId).toBe('aaaaaaaa-0000-4000-8000-000000000001')
    expect(recAtWait?.outputs['2'].name).toBe('r')
  })

  it('refuses an invalid graph without submitting; a whitelisted per-user model passes', async () => {
    const t = rig()
    const bad = t.spec({ graph: { ...t.spec().graph, '1': { class_type: 'Gen', inputs: { x: 1, lora: 'mine.safetensors' } } } })
    const e = await refusal(runJob(t.rt, bad))
    expect(e?.code).toBe('invalid')
    expect(e?.message).toContain('mine.safetensors')
    expect(t.submits).toBe(0)
    await runJob(t.rt, { ...bad, allowModels: ['mine.safetensors'] })
    expect(t.submits).toBe(1)
  })

  it('refuses when a bound input file is missing', async () => {
    const t = rig()
    const e = await refusal(runJob(t.rt, t.spec({ binds: [['1', 'x', path.join(t.dir, 'nope.png')] ] })))
    expect(e?.code).toBe('inputs')
    expect(t.submits).toBe(0)
  })
})

describe('day budget', () => {
  it('refuses a job whose estimate passes the cap, and the spend survives a restart', async () => {
    const t = rig({ cap: 30, jobs: [fakeJob(), fakeJob({ id: 'bbbbbbbb-0000-4000-8000-000000000002' })] })
    await runJob(t.rt, t.spec({ estimateCredits: 20 })) // no balance: stays at its estimate, 20 spent
    expect(t.rt.budget.spentToday()).toBe(20)
    const e = await refusal(runJob(t.rt, t.spec({ estimateCredits: 20 })))
    expect(e?.code).toBe('budget')
    expect(e?.status).toBe(429)
    expect(e?.message).toMatch(/Day budget reached: 20\.0 of 30/)
    expect(t.submits).toBe(1)
    const after = t.restart() // a new process, nothing in memory
    expect(after.budget.spentToday()).toBe(20)
    expect((await refusal(runJob(after, t.spec({ estimateCredits: 11 }))))?.code).toBe('budget')
    expect(t.submits).toBe(1)
  })

  it('refuses everything while CANVAS_DAY_BUDGET is unset', async () => {
    const t = rig({ cap: null })
    expect((await refusal(runJob(t.rt, t.spec())))?.code).toBe('unconfigured')
    expect(t.submits).toBe(0)
  })

  it('starts a new day at zero', async () => {
    let day = '2026-10-19'
    const t = rig({ cap: 30, today: () => day })
    await runJob(t.rt, t.spec({ estimateCredits: 25 }))
    day = '2026-10-20'
    expect(t.rt.budget.spentToday()).toBe(0)
  })

  it('hands the estimate back when submit itself throws (nothing billed)', async () => {
    const t = rig()
    const rt = t.restart({ submit: async () => { throw new Error('boom') } })
    expect((await refusal(runJob(rt, t.spec())))?.code).toBe('submit')
    expect(rt.budget.spentToday()).toBe(0)
  })
})

describe('recover by id', () => {
  it('survives a crash mid-wait: the restarted process fetches the result by id and never submits again', async () => {
    const hung = fakeJob({ wait: () => new Promise<void>(() => {}) }) // the process "dies" here
    const t = rig({ jobs: [hung] })
    void runJob(t.rt, t.spec()).catch(() => {})
    for (let i = 0; i < 50 && records(t.dir)[0]?.status !== 'waiting'; i++) await new Promise((r) => setTimeout(r, 5))
    expect(records(t.dir)[0]?.status).toBe('waiting') // on disk, with the job id
    expect(t.ledger()).toContain('submitted')

    const fetched: string[] = []
    const rt2 = t.restart({ getJob: async (id) => { fetched.push(id); return fakeJob({ id }) } })
    expect(rt2.store.open()).toHaveLength(1) // the restart sees it in flight
    const r = await recoverJob(rt2, 'aaaaaaaa-0000-4000-8000-000000000001')
    expect(fetched).toEqual(['aaaaaaaa-0000-4000-8000-000000000001'])
    expect(t.submits).toBe(1) // no second submission
    expect(readFileSync(r.saved[0], 'utf8')).toBe('png')
    expect(rt2.store.open()).toHaveLength(0)
    expect(rt2.store.list()[0]).toMatchObject({ status: 'done', recovered: true })
    expect(t.ledger()).toContain('recovered')
  })

  it('a lost wait is marked needs-recover (not failed) and keeps the estimate in the budget', async () => {
    const t = rig({ jobs: [fakeJob({ wait: async () => { throw new Error('socket hang up') } })] })
    const e = await refusal(runJob(t.rt, t.spec()))
    expect(e?.message).toContain('do not resubmit')
    expect(e?.jobId).toBe('aaaaaaaa-0000-4000-8000-000000000001')
    expect(t.rt.store.list()[0].status).toBe('needs-recover')
    expect(t.rt.budget.spentToday()).toBe(20)
  })

  it('does not submit when the recovered job failed on Cloud', async () => {
    const t = rig()
    const rt = t.restart({ getJob: async (id) => fakeJob({ id, status: 'failed', error: { message: 'x' } }) })
    expect((await refusal(recoverJob(rt, 'cccccccc-0000-4000-8000-000000000003', { '2': { dir: t.out, name: 'r' } })))?.status).toBe(409)
    expect(t.submits).toBe(0)
  })
})

describe('Cloud hiccup (MTPHead) retry', () => {
  const hiccup = (id: string) => fakeJob({ id, status: 'failed', error: HICCUP })
  const ids = ['dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000003']

  it('resubmits a free hiccup (balance delta 0) and succeeds, with a ledger row per attempt', async () => {
    const t = rig({ jobs: [hiccup(ids[0]), hiccup(ids[1]), fakeJob({ id: ids[2] })], balance: async () => 1000 })
    const r = await runJob(t.rt, t.spec())
    expect(t.submits).toBe(3)
    expect(r.attempts).toBe(3)
    expect(t.ledger().match(/\| submitted \|/g)).toHaveLength(3)
  })

  it('gives up after 3 submissions', async () => {
    const t = rig({ jobs: ids.map(hiccup).concat(fakeJob()), balance: async () => 1000 })
    expect((await refusal(runJob(t.rt, t.spec())))?.code).toBe('failed')
    expect(t.submits).toBe(3)
  })

  it('never resubmits a hiccup that billed (non-zero delta)', async () => {
    const b = [1000, 990]
    const t = rig({ jobs: [hiccup(ids[0]), fakeJob({ id: ids[1] })], balance: async () => b.shift() ?? 990 })
    expect((await refusal(runJob(t.rt, t.spec())))?.code).toBe('failed')
    expect(t.submits).toBe(1)
    expect(t.rt.budget.spentToday()).toBe(21.1) // billed failure: charged at the measured cost
  })

  it('never resubmits any other failure, even at zero cost', async () => {
    const t = rig({ jobs: [fakeJob({ id: ids[0], status: 'failed', error: { class_type: 'KSampler', message: 'OOM' } }), fakeJob({ id: ids[1] })], balance: async () => 1000 })
    expect((await refusal(runJob(t.rt, t.spec())))?.code).toBe('failed')
    expect(t.submits).toBe(1)
  })
})
