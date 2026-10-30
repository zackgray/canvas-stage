// Tidy wave (STALE): a piece built or moved after the take's frames were prepared leaves the clay showing the old set, while the
// take's startKey (camera, focal, performance frame) is unchanged. Render must say so and refuse free, before any spend; frames
// prepared after the change pass. The cast rule Render uses is the shared one Shoot's hero list uses (startKey.ts castStale).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { castStale } from '../../../src/shared/startKey.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { KitStore } from '../../stage3d/store.ts'
import { resetFinishing } from '../finish.ts'
import { mount, STILL, world } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })

const MADE = '2026-10-22T19:05:00.000Z'

/** the L2R rig's take on a kit world, its clay prepared at MADE; the still names `still` as its cast card */
function kitTake(o: { castId?: string; still?: string } = {}) {
  const w = world({ clay: { startedAt: MADE, finishedAt: '2026-10-22T19:06:00.000Z' }, still: o.still ? { castId: o.still } : {} })
  const kits = new KitStore(w.pub)
  const kit = kits.create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]], ...(o.castId ? { castId: o.castId } : {}) }, description: 'set moved test' })
  writeFileSync(w.dirs.take, JSON.stringify({ ...w.take, worldId: `locations/${kit.id}` }))
  /** move the first kit piece 1 m, stamped at `at` (server/stage3d/store.ts changeKit, as a drag or a landed piece does) */
  const move = (at: string) => kits.changeKit(kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)), new Date(at))
  return { w, kits, kit, move }
}

describe('Render after the set changed', () => {
  it('frames prepared before a piece moved: not Ready, the set named, and a press refused free (nothing submitted)', async () => {
    const { w, move } = kitTake()
    move('2026-10-22T19:30:00.000Z')
    const m = mount(w, w.runtime())
    expect((await m.status()).body.missing).toEqual([expect.objectContaining({ code: 'clay_set_moved', message: expect.stringMatching(/The set has changed since these frames were prepared/),
      where: expect.stringMatching(/press Draw the first frame on this take: it prepares the frames again from the set as it stands \(free, the same take/) }),
    expect.objectContaining({ code: 'stale_still', message: expect.stringMatching(/drawn before the set changed/) })])
    const r = await m.render()
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([409, 'clay_set_moved', 0])
    expect(w.jobs.ledger()).toBe('')
  })

  it('a set changed before the frames were prepared (or never) is no refusal', async () => {
    const never = kitTake()
    expect((await mount(never.w, never.w.runtime()).status()).body.missing).toEqual([])
    const before = kitTake()
    before.move('2026-10-22T19:01:00.000Z')
    expect((await mount(before.w, before.w.runtime()).status()).body.missing).toEqual([])
  })

  it('frames prepared again after the change pass the set check; the first frame drawn on the old set stays stale', async () => {
    const { w, move } = kitTake()
    move('2026-10-22T19:30:00.000Z')
    const clay = path.join(w.dirs.clay, 'clay.json')
    writeFileSync(clay, JSON.stringify({ takeId: w.take.id, startKey: w.take.startKey, mp4: 'x', frames: w.take.frames, width: 1920, height: 1088, status: 'done', startedAt: '2026-10-22T19:31:00.000Z' }))
    expect((await mount(w, w.runtime()).status()).body.missing).toEqual([expect.objectContaining({ code: 'stale_still', message: expect.stringMatching(/drawn before the set changed/) })])
    // a first frame drawn after the change (on the new frames) is the take's and passes
    const still = path.join(w.dirs.hero, `${STILL}.json`)
    writeFileSync(still, JSON.stringify({ ...JSON.parse(readFileSync(still, 'utf8')), createdAt: '2026-10-22T19:32:00.000Z' }))
    expect((await mount(w, w.runtime()).status()).body.missing).toEqual([])
  })
})

describe('the cast stale rule (shared by Render and Shoot)', () => {
  it('a still drawn for another card than the world names now is stale on Render', async () => {
    const { w } = kitTake({ castId: 'bob', still: 'ana' })
    expect((await mount(w, w.runtime()).status()).body.missing).toEqual([expect.objectContaining({ code: 'stale_still', message: expect.stringMatching(/another character/) })])
  })
  it('castStale: same card or an unrecorded one passes; another card or nobody now is stale', () => {
    expect(castStale({ castId: 'ana' }, 'ana')).toBe(false)
    expect(castStale({}, 'bob')).toBe(false)
    expect(castStale({ castId: 'ana' }, 'bob')).toBe(true)
    expect(castStale({ castId: 'ana' }, null)).toBe(true)
    expect(castStale({ castId: null }, null)).toBe(false)
  })
})
