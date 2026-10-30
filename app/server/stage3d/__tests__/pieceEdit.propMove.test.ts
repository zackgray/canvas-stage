// prop-movement wave: the piece edit route carries a piece's base tilt (pitchDeg/rollDeg, normalized like the turn and clamped) and
// its travel (`move`: validated by the same moveErrors the plan gate uses, null clears); a saved scene reload keeps the travel, and
// a rebuilt piece keeps its tilt and travel.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../../../src/stage3d/contract.ts'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { parsePlan } from '../../../src/stage3d/plan.ts'
import { placePiece, pieceItem } from '../../pieces/place.ts'
import { KitStore } from '../store.ts'
import { editKit } from '../pieceEdit.ts'

const planOf = (): ScenePlan => ({ ...(JSON.parse(JSON.stringify(PLANS['open-field-day'])) as ScenePlan), kit: [
  { kind: 'barrels', at: [8, -10] }, { kind: 'crates', at: [-8, -12] },
] })
const PATH = { path: [[-8, -12], [-8, -20], [0, -20]], speed: 3 }

describe('the piece edit route: tilt and travel', () => {
  it('pitch and roll normalize like the turn (0.1° steps) and a tilt outside the range is refused', () => {
    const kit = editKit(planOf(), { index: 0, kind: 'barrels', pitchDeg: 12.34, rollDeg: 45.06 })
    expect(kit[0].pitchDeg).toBe(12.3)
    expect(kit[0].rollDeg).toBe(45.1)
    expect(() => editKit(planOf(), { index: 0, kind: 'barrels', pitchDeg: 95 })).toThrow(/pitchDeg must be a number from -90 to 90/)
    expect(() => editKit(planOf(), { index: 0, kind: 'barrels', rollDeg: -120 })).toThrow(/rollDeg must be a number from -90 to 90/)
    expect(() => editKit(planOf(), { index: 0, kind: 'barrels', rollDeg: 'x' })).toThrow(/rollDeg must be a number/)
  })

  it('a move is validated like the plan gate and stored rounded; the resting place stays the path\'s start', () => {
    const kit = editKit(planOf(), { index: 1, kind: 'crates', move: { ...PATH, path: PATH.path.map(([x, z]) => [x + 0.004, z]) as [number, number][] } })
    expect(kit[1].move).toEqual({ path: [[-8, -12], [-8, -20], [0, -20]], speed: 3 })
    expect(kit[1].at).toEqual([-8, -12]) // the resting place is untouched
    expect(() => editKit(planOf(), { index: 1, kind: 'crates', move: { path: [[0, 0]], speed: 3 } })).toThrow(/move\.path/)
    expect(() => editKit(planOf(), { index: 1, kind: 'crates', move: { path: [[0, 0], [1, 1]], speed: 99 } })).toThrow(/move\.speed/)
    expect(() => editKit(planOf(), { index: 1, kind: 'crates', move: { path: [[0, 0], [1, 1]], speed: 3, spin: 1 } })).toThrow(/move: unknown field/)
  })

  it('move null clears the travel', () => {
    const withMove = editKit(planOf(), { index: 1, kind: 'crates', move: PATH })
    expect(withMove[1].move).toEqual(PATH)
    const cleared = editKit({ ...planOf(), kit: withMove }, { index: 1, kind: 'crates', move: null })
    expect(cleared[1].move).toBeUndefined()
  })

  it('a saved scene reload keeps the path: the stored plan re-parses whole', () => {
    const s = new KitStore(mkdtempSync(path.join(tmpdir(), 'move-')))
    const plan = planOf()
    const w = s.create({ plan, description: 'move' })
    const saved = s.movePiece(w.id, { index: 1, kind: 'crates', pitchDeg: 8, rollDeg: -3, move: PATH })
    expect(saved.plan.kit[1].move).toEqual(PATH)
    const reread = s.read(w.id) // read() re-parses plan.json, as every load does
    expect(reread.plan.kit[1].move).toEqual(PATH)
    expect(reread.plan.kit[1].pitchDeg).toBe(8)
    expect(parsePlan(JSON.parse(JSON.stringify(reread.plan))).ok).toBe(true)
  })

  it('a rebuilt piece keeps its tilt and travel (the Set\'s rebuild does not lose the path)', () => {
    const plan = planOf()
    const placed = placePiece(plan, pieceItem('crate', 'crates', '/lab-assets/pieces/crate.glb', null, 2))
    const tilted = placed.kit.map((k) => (k.pieceTag === 'prop:crates' ? { ...k, pitchDeg: 8, rollDeg: -3, move: PATH } : k))
    const rebuilt = placePiece({ ...plan, kit: tilted }, pieceItem('crate', 'crates', '/lab-assets/pieces/crate.glb', null, 2))
    const again = rebuilt.kit.find((k) => k.pieceTag === 'prop:crates')!
    expect(again.pitchDeg).toBe(8)
    expect(again.rollDeg).toBe(-3)
    expect(again.move).toEqual(PATH)
    expect(again.at).toEqual(placed.kit.find((k) => k.pieceTag === 'prop:crates')!.at)
  })
})
