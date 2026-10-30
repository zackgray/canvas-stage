// Track C: the Set's top view edits the plan through the kit world's own routes: scale, remove, add and the subject's mark. Every
// change rewrites plan.json, so the set key (shoot/setKey.ts setKeyOf, a hash of the plan Shoot reads) changes with it, and the
// approval keyed on it goes stale; a change that changes nothing writes nothing.
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../../../src/stage3d/contract.ts'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { markOf } from '../../../src/stage3d/mark.ts'
import { standPath } from '../../../src/stage3d/motion/standPlan.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { FILES, KitStore } from '../store.ts'

function world() {
  const s = new KitStore(mkdtempSync(path.join(tmpdir(), 'edit-')))
  const plan: ScenePlan = { ...(JSON.parse(JSON.stringify(PLANS['open-field-day'])) as ScenePlan), kit: [
    { kind: 'barrels', at: [8, -10] }, { kind: 'crates', at: [-8, -12], label: 'a white hive' },
  ] }
  const w = s.create({ plan, description: 'edit' })
  writeFileSync(path.join(s.dir(w.id), FILES.masterDepth), 'x')
  return { s, id: w.id, key: () => setKeyOf(s.read(w.id).plan) }
}

describe('editing the set from its top view', () => {
  it('scale changes exactly one piece and the set key', () => {
    const { s, id, key } = world()
    const k0 = key()
    const w = s.movePiece(id, { index: 1, kind: 'crates', scale: 1.7 })
    expect(w.plan.kit[1]).toEqual({ kind: 'crates', at: [-8, -12], label: 'a white hive', scale: 1.7 })
    expect(w.plan.kit[0]).toEqual({ kind: 'barrels', at: [8, -10] })
    expect(key()).not.toBe(k0)
    expect(() => s.movePiece(id, { index: 1, kind: 'crates', scale: 150 })).toThrow(/scale must be/)
  })

  it('a piece grows far past the old 4x (owner 2026-10-29: a grandstand tens of metres wide), up to the plan sanity bound', () => {
    const { s, id } = world()
    expect(s.movePiece(id, { index: 1, kind: 'crates', scale: 30 }).plan.kit[1].scale).toBe(30)
    expect(s.read(id).plan.kit[1].scale).toBe(30) // on disk: a re-read (a reload, another tab) finds it
    expect(s.movePiece(id, { index: 1, kind: 'crates', scale: 100 }).plan.kit[1].scale).toBe(100)
  })

  it('L4: lift sets one piece\'s height above the ground, inside the plan\'s own range; the other pieces are untouched', () => {
    const { s, id, key } = world()
    const k0 = key()
    const w = s.movePiece(id, { index: 1, kind: 'crates', lift: 0.5 })
    expect(w.plan.kit[1]).toEqual({ kind: 'crates', at: [-8, -12], label: 'a white hive', lift: 0.5 })
    expect(w.plan.kit[0]).toEqual({ kind: 'barrels', at: [8, -10] })
    expect(key()).not.toBe(k0)
    expect(s.movePiece(id, { index: 1, kind: 'crates', lift: -2 }).plan.kit[1].lift).toBe(-2) // the range's floor
    expect(() => s.movePiece(id, { index: 1, kind: 'crates', lift: 11 })).toThrow(/lift must be/)
  })

  it('remove drops the piece, stamps the set changed, drops the master depth and changes the key; a stale kind is refused', () => {
    const { s, id, key } = world()
    const k0 = key(), at = new Date('2026-10-25T10:00:00Z')
    const w = s.movePiece(id, { index: 0, kind: 'barrels', remove: true }, at)
    expect(w.plan.kit.map((i) => i.kind)).toEqual(['crates'])
    expect(s.setChangedAt(id)).toBe(at.toISOString())
    expect(existsSync(path.join(s.dir(id), FILES.masterDepth))).toBe(false)
    expect(key()).not.toBe(k0)
    expect(() => s.movePiece(id, { index: 0, kind: 'barrels', remove: true })).toThrow(/the set changed/)
  })

  it('add puts a new kit piece at a free spot the plan accepts, or where asked; a refused add writes nothing', () => {
    const { s, id, key } = world()
    const k0 = key()
    const w = s.movePiece(id, { add: { kind: 'tree' } })
    expect(w.plan.kit).toHaveLength(3)
    expect(w.plan.kit[2].kind).toBe('tree')
    expect(key()).not.toBe(k0)
    expect(s.movePiece(id, { add: { kind: 'rock', at: [5, -20], scale: 2 } }).plan.kit[3]).toMatchObject({ kind: 'rock', at: [5, -20], scale: 2 })
    expect(() => s.movePiece(id, { add: { kind: 'spaceship' } })).toThrow(/would not be valid/)
    expect(s.read(id).plan.kit).toHaveLength(4)
  })

  it('a removed piece goes back as it was (the Put back button re-adds the same item)', () => {
    const { s, id } = world()
    const gone = s.read(id).plan.kit[1]
    s.movePiece(id, { index: 1, kind: 'crates', remove: true })
    const w = s.movePiece(id, { add: gone })
    expect(w.plan.kit.at(-1)).toMatchObject({ kind: 'crates', label: 'a white hive', at: [-8, -12] })
  })

  it('the mark: a plan without one has the corridor start; a move changes the key, keeps the master depth, and moves a path that began on it', () => {
    const { s, id, key } = world()
    expect(markOf(s.read(id).plan).at).toEqual([0.6, -12.5])
    const k0 = key()
    const w = s.setMark(id, { at: [2.234, -9], yawDeg: 190 })
    expect(w.plan.mark).toEqual({ at: [2.23, -9], yawDeg: -170 })
    expect(key()).not.toBe(k0)
    expect(existsSync(path.join(s.dir(id), FILES.masterDepth))).toBe(true) // the mark is not in the master's depth
    expect(w.perf.path).toEqual(standPath({ at: [2.23, -9], yawDeg: -170 })) // the default stand moves and turns with the mark
    expect(() => s.setMark(id, { at: 'x' })).toThrow(/body must be/)
    expect(s.setMark(id, { at: [2.23, -9], yawDeg: -170 }).plan.mark).toEqual({ at: [2.23, -9], yawDeg: -170 }) // no change: nothing stamped again
  })

  it('a path that did not begin on the mark begins on it at the next save, and moves with it after (wave A: the mark is the start)', () => {
    const { s, id } = world()
    expect(s.savePerformance(id, { path: [[3, -14], [0.6, -8]], pace: 0.8 }).perf.path[0]).toEqual([0.6, -12.5])
    expect(s.setMark(id, { at: [1, -9] }).perf.path[0]).toEqual([1, -9])
  })
})

describe('the sun (POST /light: plan.light.keyDir)', () => {
  it('sets the key light\'s direction and height, stamps the set changed and moves the key, and keeps the master depth', () => {
    const { s, id, key } = world()
    const k0 = key()
    const w = s.saveLight(id, { keyDir: [-90, 55] })
    expect(w.plan.light?.keyDir).toEqual([270, 55])
    expect(w.plan.light?.key).toBe(PLANS['open-field-day'].light?.key) // the rest of the light stays
    expect(key()).not.toBe(k0)
    expect(s.setChangedAt(id)).not.toBeNull()
    expect(existsSync(path.join(s.dir(id), FILES.masterDepth))).toBe(true) // light is no depth
  })

  it('refuses a body that is not a direction, or a sun below the horizon, in plain words, writing nothing', () => {
    const { s, id, key } = world()
    const k0 = key()
    expect(() => s.saveLight(id, { keyDir: 'east' })).toThrow(/keyDir: \[yaw, elevation\]/)
    expect(() => s.saveLight(id, { keyDir: [90, -5] })).toThrow(/sun's height must be 0 to 80 degrees/)
    expect(key()).toBe(k0)
  })
})
