// Tidy fix pass (T3): the paid still has a set check of its own, the Render rule (l2r/inputs claySetMoved), so a take locked before
// set keys, or a second tab whose page still reads Locked after another tab moved a piece, cannot draw 21 cr on the old set's depth.
// The redraws cut their masks from the same clay, so they refuse the same way. lockTake stamps a reused key-less take with the keys,
// and a key-less take whose set moved since its lock is not reused. Server only, fake Cloud: nothing billed.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lockRequest } from '../../../src/labs/projection/clay/plan.ts'
import { fakeTake } from '../../../src/labs/projection/clay/__fixtures__/take.ts'
import { shotPaths, type TakeLockRequest } from '../../../src/shared/shotContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { resetRegistry } from '../../passes/registry.ts'
import { KitStore } from '../../stage3d/store.ts'
import { approveSetOnDisk } from '../../bible/__tests__/approveFixture.ts'
import { parseLockRequest } from '../../takes/request.ts'
import { lockTake } from '../../takes/store.ts'
import { kitInfo, kitTake, pngJob, stillPng, type KitTake } from './kitRig.ts'
import { mount } from './rig.ts'
import { redrawTake, STILL_ID } from './redrawRig.ts'

const MADE = '2026-10-25T09:00:00.000Z'
const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })
beforeEach(() => resetRegistry())

/** the rig's clay, stamped as prepared at MADE; `move` moves the first piece at `at` (what a drag in any tab does on disk) */
function prepared<T extends KitTake>(t: T, setKey?: string) {
  const f = path.join(t.clayDir, 'clay.json')
  writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), startedAt: MADE }))
  if (setKey) writeFileSync(path.join(t.shot, 'take.json'), JSON.stringify({ ...t.take, setKey }))
  // the owner approves the moved set again, so the press reaches the clay's own set check (the approval gate has its own tests)
  const move = (at: string) => { const w = new KitStore(t.pub).changeKit(t.kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)), new Date(at)); approveSetOnDisk(t.pub, t.kit.id); return w }
  return { t, move }
}
const press = (t: KitTake) => {
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000a01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-000000000a02', stillPng()))
  return mount(t, t.runtime({ fetchInfo: async () => kitInfo() })).render({})
}
const intents = (t: KitTake) => (existsSync(t.heroDir) ? readdirSync(t.heroDir).filter((f) => f.startsWith('intent-')) : [])

describe('the kit still press checks the set itself', () => {
  it('a take locked before set keys, its set moved after Prepare: refused free (409 clay_set_moved), nothing sent or written', async () => {
    const { t, move } = prepared(kitTake())
    move('2026-10-25T09:30:00.000Z')
    const r = await press(t)
    expect([r.status, (r.body as { code?: string }).code, t.jobs.submits]).toEqual([409, 'clay_set_moved', 0])
    expect((r.body as { error: string }).error).toMatch(/Draw the first frame again: it prepares the frames from the set as it stands first \(free, the same take\), then draws\. Nothing was billed/)
    expect(intents(t)).toEqual([])
    expect(t.jobs.ledger()).toBe('')
  })
  it('a second tab: the take carries a set key, the other tab moved a piece; this tab\'s press is refused the same way', async () => {
    const { t, move } = prepared(kitTake(), 'aaaa0001')
    move('2026-10-25T09:30:00.000Z')
    const r = await press(t)
    expect([r.status, (r.body as { code?: string }).code, t.jobs.submits]).toEqual([409, 'clay_set_moved', 0])
  })
  it('a set changed before the frames were prepared is no refusal: the press draws', async () => {
    const { t, move } = prepared(kitTake())
    move('2026-10-25T08:30:00.000Z')
    const r = await press(t)
    expect([r.status, t.jobs.submits]).toEqual([200, 2])
  })
})

describe('the still\'s redraws check the set too (their masks come from the same clay)', () => {
  it('face and prop redraws on a still whose set moved since Prepare: refused free, nothing sent', async () => {
    const t = redrawTake()
    const { move } = prepared(t)
    move('2026-10-25T09:30:00.000Z')
    const hero = mount(t, t.runtime({ fetchInfo: async () => t.info }))
    for (const [pass, subject] of [['face', 'hero'], ['prop', 'trunk']]) {
      const r = await hero.raw('/redraw', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: t.take.id, stillId: STILL_ID, pass, subject }) })
      expect([r.status, (r.body as { code?: string }).code], pass).toEqual([409, 'clay_set_moved'])
    }
    expect(t.jobs.submits).toBe(0)
  })
})

describe('lockTake and a take locked before set keys', () => {
  const pack = { id: 'mocap-0000beef', fps: 24, frames: 400 }
  function setup() {
    const pub = mkdtempSync(path.join(tmpdir(), 'take-setkey-')); roots.push(pub)
    const kits = new KitStore(pub)
    const kit = kits.create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]] }, description: 'lock test' })
    /** a parsed lock as the route hands it to lockTake: the keys are checked by the route and added after the parse */
    const q = (keys: { setKey?: string; frame0Key?: string } = {}): TakeLockRequest => {
      const r = parseLockRequest(JSON.parse(JSON.stringify(lockRequest(fakeTake(1), pack, kit.id, 16 / 9))))
      if (typeof r === 'string') throw new Error(r)
      return { ...r, ...keys }
    }
    const move = (at: string) => kits.changeKit(kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)), new Date(at))
    const onDisk = (id: string) => JSON.parse(readFileSync(path.join(pub, shotPaths(id).take), 'utf8')) as Record<string, unknown>
    return { pub, q, move, onDisk }
  }
  it('reused when nothing moved since its lock, and stamped with the keys the request carries', () => {
    const s = setup()
    const old = lockTake(s.pub, s.q(), new Date('2026-10-25T09:00:00.000Z')).take
    expect('setKey' in old).toBe(false)
    const again = lockTake(s.pub, s.q({ setKey: 'aaaa0001', frame0Key: 'bbbb0001' }), new Date('2026-10-25T09:10:00.000Z'))
    expect([again.reused, again.take.id, again.take.setKey, again.take.frame0Key]).toEqual([true, old.id, 'aaaa0001', 'bbbb0001'])
    expect(s.onDisk(old.id)).toMatchObject({ setKey: 'aaaa0001', frame0Key: 'bbbb0001' })
    // from now on it is judged by that key: another set is another take
    expect(lockTake(s.pub, s.q({ setKey: 'aaaa0002', frame0Key: 'bbbb0001' }), new Date('2026-10-25T09:20:00.000Z')).reused).toBe(false)
  })
  it('not reused when its set moved after it was locked: a new take, the old record untouched', () => {
    const s = setup()
    const old = lockTake(s.pub, s.q(), new Date('2026-10-25T09:00:00.000Z')).take
    s.move('2026-10-25T09:05:00.000Z')
    const r = lockTake(s.pub, s.q({ setKey: 'aaaa0003' }), new Date('2026-10-25T09:10:00.000Z'))
    expect(r.reused).toBe(false)
    expect(r.take.id).not.toBe(old.id)
    expect('setKey' in s.onDisk(old.id)).toBe(false)
  })
})
