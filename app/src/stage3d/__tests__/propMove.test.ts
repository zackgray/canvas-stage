// propMove (prop-movement wave): a placed piece's travel — where it stands at take time t, at the stated speed, held at the path's
// end, facing the way it travels (added on top of the base turn) or keeping its own, with the walk's rounded corners.
import { describe, expect, it } from 'vitest'
import type { KitItem } from '../contract.ts'
import { movePathOf, movePoseAt, moveSeconds } from '../propMove.ts'

const runner = (over: Partial<KitItem> = {}): KitItem => ({ kind: 'crates', at: [0, 0], ...over })

describe('movePoseAt', () => {
  it('a piece without a move stays put (null: the caller uses its resting place and turn)', () => {
    expect(movePoseAt(runner(), 3)).toBeNull()
    expect(moveSeconds(runner())).toBe(0)
    expect(movePoseAt(runner({ move: { path: [[0, 0], [0, 0]], speed: 2 } }), 3)).toBeNull() // no two distinct points
  })

  it('runs the path at the stated speed: metres along = speed × t, from the first point', () => {
    const it10 = runner({ move: { path: [[0, 0], [0, 10]], speed: 2 } })
    expect(movePoseAt(it10, 0)!.at).toEqual([0, 0])
    expect(movePoseAt(it10, 2.5)!.at[1]).toBeCloseTo(5, 6)
    expect(moveSeconds(it10)).toBeCloseTo(5, 6)
    const sideways = runner({ move: { path: [[0, 0], [10, 0]], speed: 1 } })
    expect(movePoseAt(sideways, 2.5)!.at[0]).toBeCloseTo(2.5, 6)
  })

  it('holds the path\'s end past the travel', () => {
    const it10 = runner({ move: { path: [[0, 0], [0, 10]], speed: 2 } })
    expect(movePoseAt(it10, 5)!.at[1]).toBeCloseTo(10, 6)
    expect(movePoseAt(it10, 100)!.at[1]).toBeCloseTo(10, 6)
  })

  it('faces the way it travels: the returned heading is 0 towards +z, 90° towards +x; the caller adds it to the base turn', () => {
    const north = runner({ yawDeg: 8, move: { path: [[0, 0], [0, 10]], speed: 1 } })
    expect(movePoseAt(north, 1)!.yawDeg).toBeCloseTo(0, 4) // heading +z is 0°
    const east = runner({ yawDeg: 8, move: { path: [[0, 0], [10, 0]], speed: 1 } })
    expect(movePoseAt(east, 1)!.yawDeg).toBeCloseTo(90, 4) // the +x heading
  })

  it('faceTravel false keeps the base turn while the piece still moves', () => {
    const it10 = runner({ yawDeg: 15, move: { path: [[0, 0], [10, 0]], speed: 1, faceTravel: false } })
    const p = movePoseAt(it10, 2.5)!
    expect(p.at[0]).toBeCloseTo(2.5, 6)
    expect(p.yawDeg).toBe(0) // the caller adds this to the base turn alone
  })

  it('rounds the corners with the walk\'s own radius instead of cutting through them', () => {
    const elbow = runner({ move: { path: [[0, 0], [10, 0], [10, 10]], speed: 1 } })
    const p = movePathOf(elbow)!
    expect(p.length).toBeLessThan(20) // a sharp corner path is 20 m
    expect(p.length).toBeGreaterThan(17) // rounded: 2 × (10 − 1.2) + 1.2·π/2 ≈ 17.9 m
    // through the corner the piece keeps ~0.5 m clear of the corner point (10, 0); a sharp path would touch it
    let nearest = Infinity
    for (let t = 0; t <= 20; t += 0.05) {
      const q = movePoseAt(elbow, t)!
      nearest = Math.min(nearest, Math.hypot(q.at[0] - 10, q.at[1]))
    }
    expect(nearest).toBeGreaterThan(0.3)
    expect(nearest).toBeLessThan(0.7)
  })
})
