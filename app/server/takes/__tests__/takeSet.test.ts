// Each take keeps its own set (PLAN-PER-TAKE-SET.md, S1): what set a take is on (takeSetOf), adoption of the scene's plan.json
// into the takes locked on it (only matching takes, never over a copy, never a take with no setKey, never one whose frames are
// behind the set), and adoption running inside changePlan before plan.json is written, for every caller. Temp folders only.
import { rmSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { resetToBuilt } from '../../stage3d/builtPlan.ts'
import { adoptSetInto, framesBehind } from '../adopt.ts'
import { adoptAllSets, adoptSceneSet, takeSetOf } from '../takeSet.ts'
import { onDisk, putTake, tempPub } from './takePerfFixture.ts'
import { putClay, setPlan, setWorld } from './takeSetFixture.ts'

const pubs: string[] = []
const pub = (tag: string) => { const p = tempPub(`set-${tag}`); pubs.push(p); return p }
afterAll(() => pubs.forEach((p) => rmSync(p, { recursive: true, force: true })))
const at = (hhmm: string) => new Date(`2026-10-29T${hhmm}:00.000Z`)

describe('takeSetOf', () => {
  const K = setKeyOf(setPlan)!
  const other = { ...setPlan, seed: setPlan.seed + 1 }
  it('own / adopted copy that hashes to the setKey', () => {
    expect(takeSetOf({ setKey: K, set: setPlan, setFrom: 'lock' }, { plan: other })).toEqual({ state: 'own', set: setPlan })
    expect(takeSetOf({ setKey: K, set: setPlan, setFrom: 'reprepare' }, null).state).toBe('own')
    expect(takeSetOf({ setKey: K, set: setPlan, setFrom: 'adopted' }, null).state).toBe('adopted')
  })
  it('a copy that does not hash to its setKey is unmatched, never silently matched', () => {
    expect(takeSetOf({ setKey: K, set: other, setFrom: 'lock' }, { plan: other })).toEqual({ state: 'unmatched', set: null })
  })
  it('no copy: the scene plan while it hashes to the setKey and the frames are on it, else unmatched; no setKey is none', () => {
    expect(takeSetOf({ setKey: K }, { plan: setPlan })).toEqual({ state: 'adopted', set: setPlan })
    expect(takeSetOf({ setKey: K }, { plan: setPlan }, true).state).toBe('unmatched')
    expect(takeSetOf({ setKey: K }, { plan: other }).state).toBe('unmatched')
    expect(takeSetOf({ setKey: K }, null).state).toBe('unmatched')
    expect(takeSetOf({}, { plan: setPlan })).toEqual({ state: 'none', set: null })
  })
})

describe('set adoption', () => {
  it('copies plan.json only into matching keyed takes of that world with no copy; others untouched byte for byte', () => {
    const p = pub('only')
    const a = setWorld(p), b = setWorld(p)
    b.store.saveSky(b.id, { look: 'night' }, at('09:30'))
    const match = putTake(p, { worldId: a.id, packId: null, setKey: a.key() })
    const prefixed = putTake(p, { worldId: `lab/${a.id}`, packId: 'mocap-00000001', setKey: a.key() })
    const otherKey = putTake(p, { worldId: a.id, packId: null, setKey: '00000000' })
    const otherWorld = putTake(p, { worldId: b.id, packId: null, setKey: a.key() })
    const keyless = putTake(p, { worldId: a.id, packId: null })
    const before = [otherKey, otherWorld, keyless].map((t) => JSON.stringify(onDisk(p, t.id)))
    expect(adoptSceneSet(p, a.id).sort()).toEqual([match.id, prefixed.id].sort())
    expect(onDisk(p, match.id)).toEqual({ ...match, set: a.plan(), setFrom: 'adopted', setSince: null })
    expect(setKeyOf(onDisk(p, prefixed.id).set)).toBe(prefixed.setKey)
    expect([otherKey, otherWorld, keyless].map((t) => JSON.stringify(onDisk(p, t.id)))).toEqual(before)
    expect(adoptSceneSet(p, a.id)).toEqual([]) // a second run writes nothing
  })

  it('never overwrites a copy a take already holds, even one that no longer matches', () => {
    const p = pub('keep')
    const w = setWorld(p)
    const own = putTake(p, { worldId: w.id, packId: null, setKey: w.key(), set: w.plan(), setFrom: 'lock', setSince: null })
    const stale = putTake(p, { worldId: w.id, packId: null, setKey: w.key(), set: { ...setPlan, seed: 99 }, setFrom: 'adopted', setSince: 'x' })
    expect(adoptSetInto(p, w.id, w.plan(), '2026-10-29T08:00:00.000Z')).toEqual([])
    expect(onDisk(p, own.id)).toEqual(own)
    expect(onDisk(p, stale.id)).toEqual(stale)
  })

  it('a take whose frames were made before the set last changed is left alone; one re-prepared after it adopts', () => {
    const p = pub('behind')
    const w = setWorld(p)
    w.store.saveSky(w.id, { look: 'dusk' }, at('11:00')) // after both locks (10:00:..)
    const since = w.store.setChangedAt(w.id)
    const behind = putTake(p, { worldId: w.id, packId: null, setKey: w.key() })
    const reprepared = putTake(p, { worldId: w.id, packId: null, setKey: w.key() })
    putClay(p, reprepared.id, '2026-10-29T11:30:00.000Z')
    const oldClay = putTake(p, { worldId: w.id, packId: null, setKey: w.key() })
    putClay(p, oldClay.id, '2026-10-29T10:30:00.000Z')
    expect([framesBehind(p, behind, since), framesBehind(p, reprepared, since), framesBehind(p, oldClay, since)]).toEqual([true, false, true])
    expect(adoptSceneSet(p, w.id)).toEqual([reprepared.id])
    expect(onDisk(p, reprepared.id).setSince).toBe(since)
    expect(onDisk(p, behind.id).set).toBeUndefined()
    expect(onDisk(p, oldClay.id).set).toBeUndefined()
  })

  it('adoptAllSets (the list GET) adopts across every world with a keyed take without a copy', () => {
    const p = pub('all')
    const a = setWorld(p), b = setWorld(p)
    const ta = putTake(p, { worldId: a.id, packId: null, setKey: a.key() }), tb = putTake(p, { worldId: b.id, packId: null, setKey: b.key() })
    const gone = putTake(p, { worldId: 'loc-2026-01-01T00-00-00-000', packId: null, setKey: a.key() }) // its world is not on disk
    expect(adoptAllSets(p).sort()).toEqual([ta.id, tb.id].sort())
    expect(onDisk(p, gone.id).set).toBeUndefined()
  })
})

describe('set adoption runs inside changePlan, before plan.json is written, for every caller', () => {
  const callers: [string, (w: ReturnType<typeof setWorld>) => void][] = [
    ['changeKit (a piece landing: pieces/run.ts completePiece)', (w) => w.store.changeKit(w.id, (plan) => plan.kit.slice(1), at('12:00'))],
    ['movePiece (/piece)', (w) => w.store.movePiece(w.id, { index: 0, kind: setPlan.kit[0].kind, remove: true }, at('12:00'))],
    ['setMark (/mark)', (w) => w.store.setMark(w.id, { at: [3, -12], yawDeg: 20 }, at('12:00'))],
    ['saveSky (/sky)', (w) => w.store.saveSky(w.id, { look: 'night' }, at('12:00'))],
    ['saveGround (/ground)', (w) => w.store.saveGround(w.id, { ground: setPlan.ground === 'rolling' ? 'flat' : 'rolling' }, at('12:00'))],
    ['saveLight (/light)', (w) => w.store.saveLight(w.id, { keyDir: [123, 33] }, at('12:00'))],
  ]
  for (const [name, change] of callers) {
    it(`${name}: the take locked on the old set keeps it`, () => {
      const p = pub('caller')
      const w = setWorld(p)
      const before = w.plan(), key = w.key()
      const t = putTake(p, { worldId: w.id, packId: null, setKey: key })
      change(w)
      expect(w.key()).not.toBe(key)
      expect(onDisk(p, t.id)).toMatchObject({ set: before, setFrom: 'adopted', setSince: null })
      expect(takeSetOf(onDisk(p, t.id), { plan: w.plan() })).toEqual({ state: 'adopted', set: before })
    })
  }

  it('resetToBuilt (/reset): adoption first, stamped with the change before it', () => {
    const p = pub('reset')
    const w = setWorld(p)
    w.store.saveSky(w.id, { look: 'storm' }, at('09:30'))
    const before = w.plan(), key = w.key()
    const t = putTake(p, { worldId: w.id, packId: null, setKey: key })
    resetToBuilt(w.store, w.id, at('12:00'))
    expect(w.key()).not.toBe(key)
    expect(onDisk(p, t.id)).toMatchObject({ set: before, setFrom: 'adopted', setSince: '2026-10-29T09:30:00.000Z' })
  })

  it('a change that changes nothing writes no take', () => {
    const p = pub('noop')
    const w = setWorld(p)
    const t = putTake(p, { worldId: w.id, packId: null, setKey: w.key() })
    w.store.changePlan(w.id, (plan) => plan, at('12:00'))
    expect(onDisk(p, t.id)).toEqual(t)
  })
})
