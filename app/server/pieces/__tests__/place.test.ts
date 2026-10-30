// Where a generated piece goes (pure): its size from the noun, the +90 TRELLIS.2 turn, the sink for walk-on pieces, the planner's
// own item for that noun replaced, else a free spot off the walk corridor and the other pieces, facing the master camera.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../../../src/stage3d/contract.ts'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { faceCamera, freeSpot, glbExtent, kitMatch, pieceItem, placePiece } from '../place.ts'
import { FIXTURE_GLB } from './rig.ts'

const plan = (kit: ScenePlan['kit'] = []): ScenePlan => ({ ...(JSON.parse(JSON.stringify(PLANS['open-field-day'])) as ScenePlan), kit })

describe('placing a generated piece', () => {
  it('reads the mesh size from the GLB accessors (the fixture box is 2 units long)', () => {
    expect(glbExtent(readFileSync(FIXTURE_GLB))).toBeCloseTo(2, 5)
    expect(glbExtent(Buffer.from('not a glb'))).toBeNull()
  })

  it('sizes to real metres, turns +90 and sinks a platform (E137: 8 m deck at about -0.66 m)', () => {
    const p = pieceItem('station platform', 'platform', '/lab-assets/a/mesh.glb', null, 1)
    expect(p).toMatchObject({ kind: 'station platform', pieceTag: 'prop:platform', glb: { yawOffsetDeg: 90, unitScale: 8, sink: 0.64 } })
    expect(pieceItem('leather trunk', 'trunk', '/lab-assets/a/mesh.glb', '/lab-assets/a/massing.glb', 0.5).glb).toEqual({ url: '/lab-assets/a/mesh.glb', massingUrl: '/lab-assets/a/massing.glb', yawOffsetDeg: 90, unitScale: 1.8 })
  })

  it('matches the planner item for the noun (plural kinds, camel case), never another generated piece', () => {
    const kit = plan([{ kind: 'weaponRack', at: [6, -6] }, { kind: 'crates', at: [7, -12] }, { kind: 'wooden crate', at: [1, 1], glb: { url: '/lab-assets/x.glb' } }]).kit
    expect(kitMatch(kit, 'wooden crate')).toBe(1)
    expect(kitMatch(kit, 'old weapon rack')).toBe(0)
    expect(kitMatch(kit, 'steam locomotive')).toBe(-1)
  })

  it('a free spot clears the corridor and the other pieces, ahead of the camera, and the piece faces the camera', () => {
    const p = plan([{ kind: 'barrels', at: [6, -8] }])
    const at = freeSpot(p, 10)
    expect(Math.abs(at[0])).toBeGreaterThan(2.5 + 5) // corridor x is ±2.5 inside the default flat, the piece 5 m half-size
    expect(at[1]).toBeLessThan(-3)
    expect(Math.hypot(at[0] - 6, at[1] + 8)).toBeGreaterThan(6.5)
    const placed = placePiece(p, pieceItem('steam locomotive', 'engine', '/lab-assets/a/mesh.glb', null, 1))
    expect(placed.placed).toBe('free')
    const it = placed.kit[1]
    expect(it.yawDeg).toBe(faceCamera(it.at))
    expect(faceCamera([0, -8])).toBe(0)
    expect(faceCamera([8, 0 - 8])).toBeLessThan(0) // on the right it turns left to face the camera
  })
})
