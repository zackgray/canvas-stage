// Hang detection on the server: a running job past its limit can be CHECKED (Cloud status by id) and RELEASED (stop waiting; the
// Cloud job is neither cancelled nor resubmitted and stays recoverable). Real runner + job records over a fake Cloud and a fake
// clock; nothing reaches Cloud and nothing is billed.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hangLimitMs } from '../../../src/jobs/hangLimits.ts'
import { JobRecords } from '../../scene/jobRecords.ts'
import type { SceneJobRecord } from '../../../src/shared/libraryContract.ts'
import { withJobContext, type JobContext } from '../context.ts'
import { checkHung, releaseHung } from '../hang.ts'
import { exclusive, JobError, runJob } from '../index.ts'
import { resetClaims } from '../inflight.ts'
import { handleLibrary, libraryCtx } from '../../scene/libraryPlugin.ts'
import { setJobRuntime } from '../runtime.ts'
import { fakeJob, gate, rig } from './rig.ts'

const SCENE = 'sc-20261025090000-aaaa'
// the records' clock; read() ages a running record by the REAL clock (MAX_LIVE_MS), so a fixed date here goes stale and reads 'lost'
const T0 = Date.now()
const PAST = (intent = 'l2r' as const) => T0 + hangLimitMs(intent) + 1

afterEach(() => resetClaims())

function records() {
  return new JobRecords(path.join(mkdtempSync(path.join(tmpdir(), 'hang-')), 'public'), () => new Date(T0))
}

/** a recorded scene job the way captureJobs makes it, and the context the route runs in */
function press(jobs: JobRecords, id: string, target = 'take-1') {
  const rec = jobs.start({ id, scene: SCENE, intent: 'l2r', target, price: 20, route: '/__lab/l2r' })
  const ctx: JobContext = { scene: SCENE, id, intent: 'l2r', target, cloud: (c) => jobs.noteCloud(rec, c), waiting: (on) => jobs.wait(rec, on), gone: () => false }
  return { rec, run: <T>(fn: () => Promise<T>) => withJobContext(ctx, fn) }
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))
const until = async (f: () => boolean) => { for (let i = 0; i < 200 && !f(); i++) await tick(5) }

describe('Release', () => {
  it('ends the wait, keeps the Cloud id recoverable, sends nothing again, and frees the runner for the next job', async () => {
    const g = gate()
    const r = rig({ jobs: [fakeJob({ id: 'cccccccc-0000-4000-8000-0000000000c1', wait: g.wait }), fakeJob({ id: 'cccccccc-0000-4000-8000-0000000000c2' })] })
    const jobs = records()
    const p = press(jobs, 'j-aaaaaa-000001')
    const first = p.run(() => runJob(r.rt, r.spec({ label: 'l2r take-1 r1' })))
    const settled = first.then(() => null, (e: unknown) => e as JobError)
    await until(() => !!jobs.raw(SCENE, 'j-aaaaaa-000001')?.cloudJobId)
    expect(jobs.raw(SCENE, 'j-aaaaaa-000001')?.cloudJobId).toBe('cccccccc-0000-4000-8000-0000000000c1') // written down before the wait

    const rel = releaseHung(jobs, SCENE, 'j-aaaaaa-000001', PAST())
    expect(rel.status).toBe(200)
    expect(rel.body).toMatchObject({ released: true, cloudJobId: 'cccccccc-0000-4000-8000-0000000000c1' })
    expect((rel.body as { message: string }).message).toMatch(/may still finish and bill/)

    const err = await settled
    expect(err).toBeInstanceOf(JobError)
    expect(err!.jobId).toBe('cccccccc-0000-4000-8000-0000000000c1') // the route answers with the id: its own Recover works
    expect(err!.message).toMatch(/released/)
    const rec = r.rt.store.list()[0]
    expect(rec.status).toBe('needs-recover')
    expect(rec.jobId).toBe('cccccccc-0000-4000-8000-0000000000c1')
    expect(r.submits).toBe(1) // nothing resubmitted

    // the lock is free: the next job runs now, while the released one is still open on Cloud's side
    const next = await runJob(r.rt, r.spec({ label: 'l2r take-2 r2' }))
    expect(next.status).toBe('done')
    g.open() // the abandoned wait finishing late changes nothing
    await tick()
    expect(r.rt.store.byJobId('cccccccc-0000-4000-8000-0000000000c1')?.status).toBe('needs-recover')
  })

  it('lets a queued job of the same section start, though the released one never answered', async () => {
    const g = gate()
    const r = rig({ jobs: [fakeJob({ id: 'cccccccc-0000-4000-8000-0000000000d1', wait: g.wait }), fakeJob({ id: 'cccccccc-0000-4000-8000-0000000000d2' })] })
    const jobs = records()
    const match = (l: string) => l.startsWith('l2r ')
    const a = press(jobs, 'j-aaaaaa-000002', 'take-1'), b = press(jobs, 'j-aaaaaa-000003', 'take-2')
    const first = a.run(() => exclusive('t-l2r', 'l2r', r.rt.store, match, () => runJob(r.rt, r.spec({ label: 'l2r take-1 r1' }))))
    first.catch(() => {})
    await until(() => !!jobs.raw(SCENE, 'j-aaaaaa-000002')?.cloudJobId)
    const second = b.run(() => exclusive('t-l2r', 'l2r', r.rt.store, match, () => runJob(r.rt, r.spec({ label: 'l2r take-2 r2' }))))
    await tick(300)
    expect(r.submits).toBe(1) // queued behind the stuck one, as before

    releaseHung(jobs, SCENE, 'j-aaaaaa-000002', PAST())
    await expect(second).resolves.toMatchObject({ status: 'done' }) // no 100 minute wait
    await expect(first).rejects.toBeInstanceOf(JobError)
    g.open()
  })

  it('frees the section even when the route is stuck where nothing can end it (the claim is dropped)', async () => {
    const r = rig({ jobs: [fakeJob({ id: 'cccccccc-0000-4000-8000-0000000000d3' })] })
    const jobs = records()
    const match = (l: string) => l.startsWith('l2r ')
    const a = press(jobs, 'j-aaaaaa-000011', 'take-1'), b = press(jobs, 'j-aaaaaa-000012', 'take-2')
    void a.run(() => exclusive('t-l2r-stuck', 'l2r', r.rt.store, match, () => new Promise<never>(() => {}))).catch(() => {}) // never answers
    await tick()
    const second = b.run(() => exclusive('t-l2r-stuck', 'l2r', r.rt.store, match, () => runJob(r.rt, r.spec({ label: 'l2r take-2 r2' }))))
    await tick(300)
    expect(r.submits).toBe(0)
    expect(releaseHung(jobs, SCENE, 'j-aaaaaa-000011', PAST()).status).toBe(200)
    await expect(second).resolves.toMatchObject({ status: 'done' })
  })

  it('refuses a job that has not run past its limit, and one still queued; the job carries on', async () => {
    const g = gate()
    const r = rig({ jobs: [fakeJob({ wait: g.wait })] })
    const jobs = records()
    const p = press(jobs, 'j-aaaaaa-000004')
    const run = p.run(() => runJob(r.rt, r.spec({ label: 'l2r take-1 r1' })))
    await until(() => !!jobs.raw(SCENE, 'j-aaaaaa-000004')?.cloudJobId)

    const early = releaseHung(jobs, SCENE, 'j-aaaaaa-000004', T0 + hangLimitMs('l2r')) // exactly at the limit: not past it
    expect(early.status).toBe(409)
    expect((early.body as { error: string }).error).toMatch(/not run longer/)
    jobs.wait(p.rec, true)
    expect(releaseHung(jobs, SCENE, 'j-aaaaaa-000004', PAST()).status).toBe(409) // queued: nothing is spent, nothing to release
    jobs.wait(p.rec, false)

    g.open()
    await expect(run).resolves.toMatchObject({ status: 'done' }) // untouched
    expect(r.rt.store.list()[0].status).toBe('done')
  })

  it('a job nothing can end by itself is written down as released: it reads lost, the same target can be pressed, the id stays', () => {
    const jobs = records()
    const p = press(jobs, 'j-aaaaaa-000005')
    jobs.noteCloud(p.rec, 'cccccccc-0000-4000-8000-0000000000e1')
    expect(jobs.list(SCENE).some((j) => j.status === 'running')).toBe(true)
    expect(releaseHung(jobs, SCENE, 'j-aaaaaa-000005', PAST()).status).toBe(200)
    const after = jobs.list(SCENE)[0] as SceneJobRecord
    expect(after.status).toBe('lost')
    expect(after.cloudJobId).toBe('cccccccc-0000-4000-8000-0000000000e1')
    expect(after.released).toBeTruthy()
    expect(jobs.runningFor('take-1', ['l2r'])).toBeNull() // the cross-scene duplicate check no longer sees it
    expect(jobs.clear(SCENE, 'j-aaaaaa-000005')).toEqual({ cleared: true }) // claimable like any lost job
  })

  it('never cancels: no Cloud call is made by a release', async () => {
    const r = rig({ getJob: async () => { throw new Error('release must not call Cloud') } })
    const jobs = records()
    press(jobs, 'j-aaaaaa-000006')
    expect(releaseHung(jobs, SCENE, 'j-aaaaaa-000006', PAST()).status).toBe(200)
    expect(r.submits).toBe(0)
  })
})

describe('Check', () => {
  it('asks Cloud by id; a finished job stops being waited on (Recover takes it from there)', async () => {
    const g = gate()
    const r = rig({ jobs: [fakeJob({ id: 'cccccccc-0000-4000-8000-0000000000f1', wait: g.wait })], getJob: async (id) => fakeJob({ id, status: 'succeeded' }) })
    const jobs = records()
    const p = press(jobs, 'j-aaaaaa-000007')
    const run = p.run(() => runJob(r.rt, r.spec({ label: 'l2r take-1 r1' })))
    const settled = run.then(() => null, (e: unknown) => e as JobError)
    await until(() => !!jobs.raw(SCENE, 'j-aaaaaa-000007')?.cloudJobId)

    const res = await checkHung(jobs, r.rt, SCENE, 'j-aaaaaa-000007')
    expect(res.body).toMatchObject({ cloud: 'succeeded', released: true })
    expect((await settled)?.jobId).toBe('cccccccc-0000-4000-8000-0000000000f1')
    expect(r.rt.store.list()[0].status).toBe('needs-recover')
    g.open()
  })

  it('a job Cloud says is still running is left alone', async () => {
    const g = gate()
    const r = rig({ jobs: [fakeJob({ wait: g.wait })], getJob: async (id) => fakeJob({ id, status: 'in_progress' }) })
    const jobs = records()
    const p = press(jobs, 'j-aaaaaa-000008')
    const run = p.run(() => runJob(r.rt, r.spec({ label: 'l2r take-1 r1' })))
    await until(() => !!jobs.raw(SCENE, 'j-aaaaaa-000008')?.cloudJobId)
    const res = await checkHung(jobs, r.rt, SCENE, 'j-aaaaaa-000008')
    expect(res.body).toMatchObject({ cloud: 'in_progress', released: false })
    g.open()
    await expect(run).resolves.toMatchObject({ status: 'done' })
  })

  it('says so when nothing was sent to Cloud, and when Cloud cannot be reached ', async () => {
    const r = rig({ getJob: async () => { throw new Error('boom') } })
    const jobs = records()
    press(jobs, 'j-aaaaaa-000009')
    expect((await checkHung(jobs, r.rt, SCENE, 'j-aaaaaa-000009')).body).toMatchObject({ cloud: null })
    jobs.noteCloud(jobs.raw(SCENE, 'j-aaaaaa-000009')!, 'cccccccc-0000-4000-8000-000000000011')
    const bad = await checkHung(jobs, r.rt, SCENE, 'j-aaaaaa-000009')
    expect(bad.status).toBe(502)
    expect((bad.body as { error: string }).error).toMatch(/Could not reach Cloud/)
    expect((await checkHung(jobs, r.rt, SCENE, 'j-nothere-000000')).status).toBe(404)
  })
})

describe('the library routes', () => {
  afterEach(() => setJobRuntime(undefined))
  it('POST .../jobs/<id>/check and /release reach the handlers; a young job is refused', async () => {
    const r = rig({ getJob: async (id) => fakeJob({ id, status: 'in_progress' }) })
    setJobRuntime(r.rt)
    const ctx = libraryCtx({ publicDir: path.join(mkdtempSync(path.join(tmpdir(), 'hang-lib-')), 'public'), now: () => new Date() })
    const scene = (await ctx.library.create('Hang')).id
    const rec = ctx.jobs.start({ id: 'j-aaaaaa-000010', scene, intent: 'l2r', target: 'take-1', price: 20, route: '/__lab/l2r' })
    ctx.jobs.noteCloud(rec, 'cccccccc-0000-4000-8000-000000000021')
    const q = new URLSearchParams()
    expect((await handleLibrary(ctx, 'POST', [scene, 'jobs', 'j-aaaaaa-000010', 'check'], q, {})).body).toMatchObject({ cloud: 'in_progress', released: false })
    expect((await handleLibrary(ctx, 'POST', [scene, 'jobs', 'j-aaaaaa-000010', 'release'], q, {})).status).toBe(409) // seconds old
    expect((await handleLibrary(ctx, 'GET', [scene, 'jobs', 'j-aaaaaa-000010', 'release'], q, null)).status).toBe(404)
  })
})
