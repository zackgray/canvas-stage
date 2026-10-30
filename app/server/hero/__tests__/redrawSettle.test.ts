// A still redraw a dead process left 'running' with no job id (review R2: it died between the candidate write and the submit) is
// settled by the shared restart settle (server/passes/settle.ts) on the next list: failed and free, so Discard clears it and a fresh
// redraw on that still is sent. One the runner's record says was sent gets its job id; one this process may still be sending is left.
// Through the real routes (GET / discard on /__lab/passes, POST /__lab/hero/redraw). Fake Cloud only.
import { describe, expect, it, beforeEach } from 'vitest'
import type { PassCandidate } from '../../../src/shared/passContract.ts'
import { call, JSON_LOCAL, post } from '../../project/__tests__/rig.ts'
import { labPasses } from '../../passes/plugin.ts'
import { resetRegistry } from '../../passes/registry.ts'
import { SEND_INTERRUPTED } from '../../passes/settle.ts'
import { createCandidate, readCandidate } from '../../passes/store.ts'
import { redrawLabel } from '../redrawSpec.ts'
import { REDRAW_INTERRUPTED } from '../stillPasses.ts'
import { mount } from './rig.ts'
import { redrawJob, redrawTake, STILL_ID, type RedrawTake } from './redrawRig.ts'

type H = Parameters<typeof call>[0]
beforeEach(() => resetRegistry())

function setup(t: RedrawTake) {
  const rt = t.runtime({ fetchInfo: async () => t.info })
  const hero = mount(t, rt) // a new process: no claims, the hooks registered again
  const routes: Record<string, H> = {}
  ;(labPasses().configureServer as (s: unknown) => void)({ config: { root: t.root, publicDir: t.pub }, middlewares: { use: (p: string, h: H) => { routes[p] = h } } })
  const passes = routes['/__lab/passes']
  return {
    rt, list: async () => (await call(passes, `/?take=${t.take.id}`)).body.candidates as PassCandidate[],
    act: (verb: string, id: string) => post(passes, `/${verb}`, { id }),
    redraw: () => hero.raw('/redraw', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: t.take.id, stillId: STILL_ID, pass: 'face', subject: 'hero' }) }),
  }
}
/** what runRedraw writes before the uploads and the submit, left behind by a process that died there */
const orphan = (t: RedrawTake) => createCandidate(t.pub, { takeId: t.take.id, pass: 'face', target: { kind: 'still', stillId: STILL_ID }, subject: 'hero', box: { x: 0, y: 0, w: 10, h: 10 },
  beforeUrl: `/lab-assets/shots/${t.take.id}/hero/${STILL_ID}.png`, costCredits: 3 })
const record = (t: RedrawTake, s: ReturnType<typeof setup>, c: PassCandidate, o: { jobId?: string; pid: number }) => {
  const now = new Date().toISOString()
  s.rt.store.save({ id: `job-rec-${c.id.slice(-4)}`, label: redrawLabel(t.take.id, c.id), status: o.jobId ? 'waiting' : 'submitting', ...(o.jobId ? { jobId: o.jobId } : {}), attempts: [],
    estimateCredits: 3, costCents: null, costCredits: null, execSeconds: null, outputs: {}, saved: [], createdAt: now, updatedAt: now, pid: o.pid })
}

describe('a still redraw orphaned before its submit', () => {
  it('settles to failed (nothing billed) on the next list; Discard clears it; a fresh redraw on that still is sent', async () => {
    const t = redrawTake()
    const lost = await orphan(t)
    const s = setup(t)
    const [c] = await s.list()
    expect(c).toMatchObject({ id: lost.id, state: 'failed', jobId: null, error: REDRAW_INTERRUPTED })
    expect(await readCandidate(t.pub, t.take.id, lost.id)).toMatchObject({ state: 'failed' }) // on disk, not only in the answer
    const d = await s.act('discard', lost.id)
    expect([d.status, d.body.candidate?.state]).toEqual([200, 'discarded'])
    t.queue.push(redrawJob('bbbbbbbb-0000-4000-8000-0000000000e1'))
    const r = await s.redraw()
    expect([r.status, r.body.error]).toEqual([200, undefined])
    expect(r.body.candidate).toMatchObject({ state: 'candidate', jobId: 'bbbbbbbb-0000-4000-8000-0000000000e1' })
    expect(t.jobs.submits).toBe(1)
  })
  it('one the runner recorded as sent gets its job id (Recover by id), never failed', async () => {
    const t = redrawTake()
    const sent = await orphan(t)
    const s = setup(t)
    record(t, s, sent, { jobId: 'bbbbbbbb-0000-4000-8000-0000000000e2', pid: process.pid })
    expect((await s.list())[0]).toMatchObject({ state: 'running', jobId: 'bbbbbbbb-0000-4000-8000-0000000000e2' })
  })
  it('one a dead process left mid-send is failed with an honest "may have been billed", not held for good', async () => {
    const t = redrawTake()
    const mid = await orphan(t)
    const s = setup(t)
    record(t, s, mid, { pid: 2 ** 22 + 12345 }) // no such process
    expect((await s.list())[0]).toMatchObject({ state: 'failed', jobId: null, error: SEND_INTERRUPTED })
  })
})
