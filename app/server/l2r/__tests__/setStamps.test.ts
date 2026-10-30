// Each take keeps its own set (PLAN-PER-TAKE-SET.md, S2 Guards; Risk 1: a render must never use a set different from the frames it
// was prepared with). Render's readiness on a kit take: a take that holds its own set keeps its prepared frames and still after the
// scene's set moves on; a clay stamped with another set than the take's reads not prepared (clay_stale) and the press is refused free;
// a still and a clay stamped with different sets block Render; a take with no copy keeps today's setChangedAt rule. Fake Cloud.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SET_STAMP_STALE } from '../../../src/shared/setStampContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { KitStore } from '../../stage3d/store.ts'
import { resetFinishing } from '../finish.ts'
import { claySetMoved, STILL_OTHER_SET, stillSetMoved } from '../inputs.ts'
import { mount, STILL, world } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })

const MADE = '2026-10-22T19:05:00.000Z'

/** the L2R rig's take on a kit world, its clay prepared at MADE, keyed to the set; `copy` = it holds its own set; stamps on clay/still */
function setTake(o: { copy: boolean; clayKey?: string; stillKey?: string }) {
  const w = world({ clay: { startedAt: MADE, finishedAt: MADE, ...(o.clayKey ? { setKey: o.clayKey } : {}) }, still: o.stillKey ? { setKey: o.stillKey } : {} })
  const kits = new KitStore(w.pub)
  const kit = kits.create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]] }, description: 'set stamp test' }, new Date('2026-10-22T18:00:00.000Z'))
  const plan = kits.read(kit.id).plan, key = setKeyOf(plan)!
  writeFileSync(w.dirs.take, JSON.stringify({ ...w.take, worldId: `locations/${kit.id}`, setKey: key, ...(o.copy ? { set: plan, setFrom: 'lock', setSince: null } : {}) }))
  const move = (at: string) => kits.changeKit(kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)), new Date(at))
  /** the take.json as it is now, with its set fields taken off (a take locked before copies, adoption bypassed) */
  const dropCopy = () => { const { set: _s, setFrom: _f, setSince: _g, ...t } = JSON.parse(readFileSync(w.dirs.take, 'utf8')); writeFileSync(w.dirs.take, JSON.stringify(t)) } // eslint-disable-line @typescript-eslint/no-unused-vars
  return { w, key, move, dropCopy }
}
/** stamps the rig's clay and still with these set keys */
function stampBoth(w: ReturnType<typeof world>, clayKey: string, stillKey: string) {
  const clay = path.join(w.dirs.clay, 'clay.json'), still = path.join(w.dirs.hero, `${STILL}.json`)
  writeFileSync(clay, JSON.stringify({ ...JSON.parse(readFileSync(clay, 'utf8')), setKey: clayKey }))
  writeFileSync(still, JSON.stringify({ ...JSON.parse(readFileSync(still, 'utf8')), setKey: stillKey }))
}
const missing = async (w: ReturnType<typeof world>) => (await mount(w, w.runtime()).status()).body.missing

describe('Render on a take that keeps its own set', () => {
  it('its frames and still stay Ready after the scene\'s set moves on (the whole point)', async () => {
    const { w, key, move } = setTake({ copy: true, clayKey: undefined })
    move('2026-10-22T19:30:00.000Z')
    expect(setKeyOf(new KitStore(w.pub).read(JSON.parse(readFileSync(w.dirs.take, 'utf8')).worldId.replace(/^.*\//, '')).plan)).not.toBe(key)
    expect(await missing(w)).toEqual([])
    // the same with both stamped with the take's own key
    const s = setTake({ copy: true })
    stampBoth(s.w, s.key, s.key)
    s.move('2026-10-22T19:30:00.000Z')
    expect(await missing(s.w)).toEqual([])
  })

  it('a clay stamped with another set reads not prepared (clay_stale) and the press is refused free', async () => {
    const { w } = setTake({ copy: true, clayKey: 'deadbeef' })
    expect(await missing(w)).toEqual([expect.objectContaining({ code: 'clay_stale', message: SET_STAMP_STALE })])
    const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([409, 'clay_stale', 0])
    expect(w.jobs.ledger()).toBe('')
  })

  it('a still and a clay stamped with different sets block Render, free', async () => {
    // a keyed take: the still's stamp is not the take's set, so it is out of date (stillSetMoved) and the press is refused
    const t = setTake({ copy: true })
    stampBoth(t.w, t.key, 'deadbeef')
    expect((await missing(t.w)).map((x: { code: string }) => x.code)).toEqual(['stale_still'])
    const r = await mount(t.w, t.w.runtime()).render()
    expect([r.status, r.body.code, t.w.jobs.submits]).toEqual([409, 'stale_still', 0])
    stampBoth(t.w, t.key, t.key)
    expect(await missing(t.w)).toEqual([])
    // a take with no set key (locked before keys) judges no stamp against itself: the still and the clay still must agree
    const k = setTake({ copy: false })
    const { setKey: _k, ...keyless } = JSON.parse(readFileSync(k.w.dirs.take, 'utf8')) // eslint-disable-line @typescript-eslint/no-unused-vars
    writeFileSync(k.w.dirs.take, JSON.stringify(keyless))
    stampBoth(k.w, k.key, 'deadbeef')
    expect(await missing(k.w)).toEqual([expect.objectContaining({ code: 'stale_still', message: `The approved still is out of date: ${STILL_OTHER_SET}.` })])
    const r2 = await mount(k.w, k.w.runtime()).render()
    expect([r2.status, r2.body.code, k.w.jobs.submits]).toEqual([409, 'stale_still', 0])
  })
})

describe('the one set rule (takes/setJudge.ts), as every caller asks it', () => {
  it('a stamp that is not the keyed take\'s set is moved, with a copy or without; the take\'s own stamp is not', () => {
    const own = setTake({ copy: true }), none = setTake({ copy: false })
    for (const t of [own, none]) {
      const take = JSON.parse(readFileSync(t.w.dirs.take, 'utf8'))
      expect(claySetMoved(t.w.pub, take, { setKey: 'deadbeef', startedAt: MADE })).toBeTruthy()
      expect(stillSetMoved(t.w.pub, take, { setKey: 'deadbeef', createdAt: MADE })).toBeTruthy()
      expect(claySetMoved(t.w.pub, take, { setKey: t.key, startedAt: MADE })).toBeNull()
      expect(stillSetMoved(t.w.pub, take, { setKey: t.key, createdAt: MADE })).toBeNull()
    }
    // with a copy, unstamped: made before the copy's setSince is moved, after it is not; the scene moving on never moves it
    const take = { ...JSON.parse(readFileSync(own.w.dirs.take, 'utf8')), setSince: '2026-10-22T19:04:00.000Z' }
    expect(claySetMoved(own.w.pub, take, { startedAt: '2026-10-22T19:03:00.000Z' })).toBe('2026-10-22T19:04:00.000Z')
    own.move('2026-10-22T19:30:00.000Z')
    expect(claySetMoved(own.w.pub, take, { startedAt: MADE })).toBeNull()
  })
})

describe('a take with no copy keeps today\'s rule', () => {
  it('a move after the frames were made: clay_set_moved, refused free; a move before: no refusal', async () => {
    const after = setTake({ copy: false })
    after.dropCopy()
    // the move is written straight to plan.json + meta (as before copies existed): no adoption
    const kitDir = path.join(after.w.pub, 'lab-assets', 'locations', JSON.parse(readFileSync(after.w.dirs.take, 'utf8')).worldId.replace(/^.*\//, ''))
    const meta = JSON.parse(readFileSync(path.join(kitDir, 'meta.json'), 'utf8'))
    writeFileSync(path.join(kitDir, 'meta.json'), JSON.stringify({ ...meta, kit: { ...meta.kit, setChangedAt: '2026-10-22T19:30:00.000Z' } }))
    expect((await missing(after.w)).map((x: { code: string }) => x.code)).toEqual(['clay_set_moved', 'stale_still'])
    const r = await mount(after.w, after.w.runtime()).render()
    expect([r.status, r.body.code, after.w.jobs.submits]).toEqual([409, 'clay_set_moved', 0])
    const before = setTake({ copy: false })
    before.move('2026-10-22T19:01:00.000Z')
    expect(await missing(before.w)).toEqual([])
  })
})
