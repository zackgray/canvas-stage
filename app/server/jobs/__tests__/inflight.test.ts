// "Is a job running?" must outlive the module that started it: Vite's in-process restart re-bundles every plugin
// module (simulated here with vi.resetModules + a fresh import), and a full process restart forgets every claim
// (resetClaims) while the job's record stays on disk.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { exclusive, isLive, MAX_LIVE_MS, pidAlive, resetClaims, running } from '../inflight.ts'
import { JobStore } from '../store.ts'
import type { JobRecord } from '../types.ts'
import { deadPid, rig } from './rig.ts'

const rec = (o: Partial<JobRecord>): JobRecord => ({ id: `job-${Math.random().toString(36).slice(2)}`, label: 'perform_take x1 s b1', status: 'waiting', jobId: 'aaaaaaaa-1',
  attempts: [], estimateCredits: 1, costCents: null, costCredits: null, execSeconds: null, outputs: {}, saved: [], createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(), pid: process.pid, ...o })

afterEach(() => resetClaims())

describe('in-flight state that survives a restart', () => {
  it('the process-wide lock is the same object after the runtime module is re-bundled', async () => {
    const a = (await import('../runtime.ts')).jobRuntime()
    vi.resetModules()
    const b = (await import('../runtime.ts')).jobRuntime()
    expect(b).not.toBe(a) // a fresh module, fresh runtime ...
    expect(b.lock).toBe(a.lock) // ... but one lock: the new module queues behind the old module's job
  })

  it('a claim taken by the old module is seen by the re-bundled one (before any record is on disk)', async () => {
    const t = rig()
    let release!: () => void
    const held = exclusive('k', 'a job', t.rt.store, () => false, () => new Promise<void>((r) => { release = r }))
    vi.resetModules()
    const fresh = await import('../inflight.ts')
    expect(fresh.running('k', t.rt.store, () => false)).toMatchObject({ what: 'a job' })
    await expect(fresh.exclusive('k', 'again', t.rt.store, () => false, async () => 'ran')).rejects.toMatchObject({ status: 409 })
    release()
    await held
    expect(await fresh.exclusive('k', 'again', t.rt.store, () => false, async () => 'ran')).toBe('ran')
  })

  it('a live record counts after the claims are gone; a dead process, a stale record or a settled job does not', () => {
    const t = rig()
    const store = new JobStore(t.dir)
    const match = (l: string) => l.startsWith('perform_take ')
    store.save(rec({ id: 'job-live' }))
    expect(running('k', store, match)).toMatchObject({ recordId: 'job-live', jobId: 'aaaaaaaa-1' })
    expect(isLive(rec({ pid: deadPid() }))).toBe(false)
    expect(pidAlive(process.pid)).toBe(true)
    expect(isLive(rec({ updatedAt: new Date(Date.now() - MAX_LIVE_MS - 1000).toISOString() }))).toBe(false)
    expect(isLive(rec({ status: 'needs-recover' }))).toBe(false)
    expect(running('k', store, (l) => l.startsWith('place '))).toBeNull() // other sections' labels do not block
  })

  it('runJob stamps its record with the server pid', async () => {
    const t = rig()
    await (await import('../run.ts')).runJob(t.rt, t.spec())
    expect(t.rt.store.list()[0].pid).toBe(process.pid)
  })
})
