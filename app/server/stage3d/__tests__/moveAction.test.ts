// Track D: a made move ('move' kind, contract ActionKind) saves with its kept clip's id and the set piece it names; the performance
// gate accepts a known id and refuses an unknown one in plain words (server/stage3d/perf.ts, checked against the kept folders).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePerformancePlan } from '../perf.ts'
import { knownMotionIds } from '../motionIds.ts'
import { FILES, KitStore } from '../store.ts'
import type { ScenePlan } from '../../../src/stage3d/contract.ts'
import { PLANS } from '../../../src/stage3d/presets.ts'

const PATH: [number, number][] = [[0.6, -12.5], [0.6, -8]]
const MOVE = { kind: 'move', at: 0, seconds: 2, motion: 'gen:take-frame', toward: [1.5, -9] as [number, number] }

describe('a made move on the performance', () => {
  it('a move with a known id and its piece saves field by field', () => {
    expect(parsePerformancePlan({ path: PATH, actions: [MOVE] }, ['gen:take-frame'])).toEqual({ ok: true, perf: { path: PATH, actions: [MOVE] } })
  })
  it('an unknown move id is refused in plain words; a malformed id is caught too', () => {
    const unknown = parsePerformancePlan({ path: PATH, actions: [MOVE] }, ['gen:other'])
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.errors.join(' ')).toMatch(/names a move we don't have.*gen:take-frame/)
    const malformed = parsePerformancePlan({ path: PATH, actions: [{ ...MOVE, motion: 'take-frame' }] }, ['gen:take-frame'])
    expect(malformed.ok).toBe(false)
    if (!malformed.ok) expect(malformed.errors.join(' ')).toMatch(/needs the id of a kept move/)
  })
  it('toward must be [x, z] inside the world; with no known list given the id is only shape-checked', () => {
    const bad = parsePerformancePlan({ path: PATH, actions: [{ ...MOVE, toward: [999, 0] }] }, ['gen:take-frame'])
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/toward must be \[x, z\]/)
    expect(parsePerformancePlan({ path: PATH, actions: [MOVE] })).toEqual({ ok: true, perf: { path: PATH, actions: [MOVE] } })
  })
  it('knownMotionIds lists the folders holding a clip.json (that is what "kept" means)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'motions-'))
    mkdirSync(path.join(dir, 'lab-assets', 'motions', 'take-frame'), { recursive: true })
    writeFileSync(path.join(dir, 'lab-assets', 'motions', 'take-frame', 'clip.json'), '{}')
    mkdirSync(path.join(dir, 'lab-assets', 'motions', 'empty'), { recursive: true }) // no clip.json: not a kept move
    mkdirSync(path.join(dir, 'lab-assets', 'motions', '.in-flight'), { recursive: true })
    expect(knownMotionIds(dir)).toEqual(['gen:take-frame'])
  })
})

describe('a saved scene with a made move, on a machine without its kept clip (Fable review: a fresh clone)', () => {
  function world() {
    const pub = mkdtempSync(path.join(tmpdir(), 'movesave-'))
    const s = new KitStore(pub)
    const plan = JSON.parse(JSON.stringify(PLANS['open-field-day'])) as ScenePlan
    const w = s.create({ plan, description: 'move' })
    // the scene as saved where the move was made: its performance names the kept clip (written as the store would have)
    const perf = { ...w.perf, actions: [{ ...MOVE, at: 0 }] }
    writeFileSync(path.join(s.dir(w.id), FILES.perf), JSON.stringify(perf))
    return { pub, s, id: w.id, perf }
  }
  it('a Blocking save that keeps the move saves; a NEW unknown move is still refused', () => {
    const { pub, s, id, perf } = world()
    expect(knownMotionIds(pub)).toEqual([]) // no kept clip here
    const kept = s.savePerformance(id, { ...perf, actions: [{ ...MOVE, at: 0, seconds: 3 }] })
    expect(kept.perf.actions?.[0]).toMatchObject({ kind: 'move', motion: 'gen:take-frame', seconds: 3 })
    expect(() => s.savePerformance(id, { ...perf, actions: [{ ...MOVE, at: 0 }, { ...MOVE, at: 1, motion: 'gen:never-made' }] })).toThrow(/not valid/)
  })
})
