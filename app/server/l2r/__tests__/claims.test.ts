// B5: an L2R intent left `running` with no job behind it (a restart mid-claim) reads back as interrupted and never billed,
// and the two paid routes (hero still, Layout-To-Render) refuse each other with a 409 instead of queueing silently.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { L2RRender } from '../../../src/shared/shotContract.ts'
import { renderHero } from '../../hero/run.ts'
import { HERO_KEY, heroLabel, isHeroLabel } from '../../hero/spec.ts'
import { deadPid, gate } from '../../jobs/__tests__/rig.ts'
import { exclusive, resetClaims } from '../../jobs/inflight.ts'
import { newRecordId } from '../../jobs/store.ts'
import { resetFinishing } from '../finish.ts'
import { isL2RLabel, L2R_KEY } from '../spec.ts'
import { writeRender } from '../store.ts'
import { l2rJob, mount, STILL, TAKE, until, world, type World } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })
const recs = (w: World) => (existsSync(w.dirs.l2r) ? readdirSync(w.dirs.l2r).filter((f) => /^l2r-.*\.json$/.test(f)) : [])
const onDisk = (w: World, id: string) => JSON.parse(readFileSync(path.join(w.dirs.l2r, `${id}.json`), 'utf8')) as L2RRender
const intent = (w: World, id: string, o: Partial<L2RRender>) => writeRender(w.pub, { id, takeId: TAKE, stillId: STILL, clay: 'c', raw: null, finished: null, jobId: null,
  credits: 0, status: 'running', estimateCredits: 11, createdAt: new Date(Date.now() - 60_000).toISOString(), ...o })

describe('a running intent with no job behind it (B5)', () => {
  it('restart mid-claim: a dead pid reads as interrupted, never billed, cleared on disk; Render works again', async () => {
    const w = world(); const m = mount(w, w.runtime())
    intent(w, 'l2r-stale', { pid: deadPid() })
    const st = (await m.status()).body
    expect(st.renders[0]).toMatchObject({ id: 'l2r-stale', status: 'failed', interrupted: true, credits: 0, jobId: null })
    expect(st.renders[0].error).toMatch(/nothing was billed/)
    expect(st.running).toBeNull()
    expect(onDisk(w, 'l2r-stale')).toMatchObject({ status: 'failed', interrupted: true }) // cleared, not re-derived forever
    const again = await m.render()
    expect(again.status).toBe(200); expect(w.jobs.submits).toBe(1)
  })

  it('this process, but no claim covers it (the request is gone) or the claim is newer: interrupted', async () => {
    const w = world(); const m = mount(w, w.runtime())
    intent(w, 'l2r-orphan', { pid: process.pid })
    expect((await m.status()).body.renders[0]).toMatchObject({ status: 'failed', interrupted: true })
    intent(w, 'l2r-older', { pid: process.pid })
    const g = gate()
    const held = exclusive(L2R_KEY, 'a newer press', w.jobs.rt.store, isL2RLabel, () => g.wait())
    expect((await m.status()).body.renders.find((r: L2RRender) => r.id === 'l2r-older')).toMatchObject({ status: 'failed', interrupted: true })
    g.open(); await held
  })

  it('the request in flight (waiting for the runner lock) stays running, then lands done', async () => {
    const w = world(); const rt = w.runtime(); const m = mount(w, rt)
    const g = gate()
    const other = rt.lock.run(() => g.wait()) // another paid job of this process holds the one-at-a-time lock
    const press = m.render()
    await until(() => recs(w).length === 1)
    const st = (await m.status()).body
    expect(st.renders[0]).toMatchObject({ status: 'running', pid: process.pid })
    expect(st.renders[0].interrupted).toBeUndefined()
    expect(w.jobs.submits).toBe(0)
    g.open(); await other
    expect((await press).body.render).toMatchObject({ status: 'done' })
  })
})

describe('hero and L2R refuse each other instead of queueing (B5)', () => {
  it('a hero job in flight: Render is a free 409 naming it, nothing written or submitted; after it, Render goes', async () => {
    const w = world(); const rt = w.runtime(); const m = mount(w, rt)
    const g = gate()
    const hero = exclusive(HERO_KEY, `a hero still of ${TAKE}`, rt.store, isHeroLabel, () => g.wait()) // the hero route's own claim
    const r = await m.render()
    expect([r.status, r.body.code]).toEqual([409, 'busy'])
    expect(r.body.error).toMatch(/another paid job is running: a hero still of take-/)
    expect(recs(w)).toEqual([]); expect(w.jobs.submits).toBe(0)
    g.open(); await hero
    expect((await m.render()).status).toBe(200)
  })

  it('a hero job left waiting by a live process (its record, no claim: a restarted module) also refuses Render', async () => {
    const w = world(); const rt = w.runtime(); const m = mount(w, rt)
    const now = new Date().toISOString()
    rt.store.save({ id: newRecordId(), label: heroLabel(TAKE, ['hero-x']), status: 'waiting', attempts: [], estimateCredits: 2, costCents: null, costCredits: null,
      execSeconds: null, outputs: {}, saved: [], createdAt: now, updatedAt: now, pid: process.pid, jobId: 'aaaaaaaa-0000-4000-8000-000000000009' })
    const r = await m.render()
    expect([r.status, r.body.error]).toEqual([409, expect.stringMatching(/another paid job is running: hero-still take-/)])
    expect(w.jobs.submits).toBe(0)
  })

  it('an L2R pass in flight: a hero press is refused the same way, before it reads anything', async () => {
    const w = world(); const rt = w.runtime(); const m = mount(w, rt)
    const g = gate()
    w.queue.push(l2rJob('bbbbbbbb-0000-4000-8000-000000000801', () => g.wait()))
    const press = m.render()
    await until(() => w.jobs.submits === 1)
    await expect(renderHero({ publicDir: w.pub, deps: { runtime: () => rt } }, { takeId: TAKE })).rejects.toThrow(/another paid job is running: a Layout-To-Render pass/)
    expect(w.jobs.submits).toBe(1)
    g.open(); expect((await press).status).toBe(200)
  })
})
