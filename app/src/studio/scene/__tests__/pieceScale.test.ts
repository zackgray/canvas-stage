// How big a set piece may be made, and its size in metres (owner 2026-10-29, the grandstand): a generated mesh 2 m across may grow
// to 100 m (scale 50), past the old 4x cap; a kit piece to 100 m on its longest side; never past the plan's sanity bound; the
// readout in metres comes from the built meshes when there are some, else from the plan.
import { BoxGeometry, Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import type { KitItem } from '../../../stage3d/contract'
import { LIMITS } from '../../../stage3d/planRules'
import { baseSizeOf, clampScale, MAX_PIECE_M, meshExtent, scaleRangeOf, sizeOf, sizeWords } from '../pieceScale'

const stand = (scale?: number): KitItem => ({
  kind: 'grandstand', at: [-6, -29], pieceTag: 'prop:grandstand', ...(scale !== undefined ? { scale } : {}),
  glb: { url: '/lab-assets/locations/loc-x/pieces/grandstand/p-1/mesh.glb', yawOffsetDeg: 90, unitScale: 2 },
})

describe('the size range', () => {
  it('a 2 m generated grandstand grows to 100 m across (scale 50), well past the old 4x', () => {
    expect(baseSizeOf(stand())).toEqual([2, 2, 2])
    expect(scaleRangeOf(stand())).toEqual([LIMITS.scale[0], 50])
    expect(clampScale(stand(), 30)).toBe(30)
    expect(clampScale(stand(), 80)).toBe(50)
    expect(clampScale(stand(), 0.01)).toBe(LIMITS.scale[0])
  })

  it('a kit piece is held to 100 m on its longest side; nothing passes the plan sanity bound', () => {
    const crates: KitItem = { kind: 'crates', args: [1, 1], at: [3, -9] }
    const [, top] = scaleRangeOf(crates)
    expect(Math.max(...baseSizeOf(crates)!) * top).toBeLessThanOrEqual(MAX_PIECE_M)
    expect(top).toBeLessThanOrEqual(LIMITS.scale[1])
    const pebble: KitItem = { ...stand(), glb: { ...stand().glb!, unitScale: 0.1 } } // 0.1 m: 1000x would be 100 m
    expect(scaleRangeOf(pebble)[1]).toBe(LIMITS.scale[1])
  })

  it('a piece already past its range keeps its size (the range never shrinks under it)', () => {
    expect(scaleRangeOf(stand(60))[1]).toBe(60)
  })
})

describe('the size in metres', () => {
  it('reads the built meshes in the root\'s own frame (turn and size left out), times unitScale x scale', () => {
    const root = new Group(), mesh = new Mesh(new BoxGeometry(1.5, 0.5, 0.8))
    root.add(mesh)
    root.rotation.y = 1.1; root.scale.setScalar(7) // a turn and a drawn size never change the measure
    const own = meshExtent(root)!
    expect(own[0]).toBeCloseTo(1.5, 6); expect(own[1]).toBeCloseTo(0.5, 6); expect(own[2]).toBeCloseTo(0.8, 6)
    const s = sizeOf(stand(20), root)!
    expect(s[0]).toBeCloseTo(60, 6); expect(s[1]).toBeCloseTo(20, 6); expect(s[2]).toBeCloseTo(32, 6)
    expect(sizeWords(s)).toBe('60 × 32 m, 20 m tall')
  })

  it('a hidden mesh (a generated piece\'s massing) is not measured; with no meshes it falls back to the plan', () => {
    const root = new Group(), hidden = new Mesh(new BoxGeometry(9, 9, 9))
    hidden.visible = false
    root.add(hidden)
    expect(meshExtent(root)).toBeNull()
    expect(sizeOf(stand(3.5), root)).toEqual([7, 7, 7])
    expect(sizeWords([7.04, 2.26, 3])).toBe('7 × 3 m, 2.3 m tall')
  })
})
