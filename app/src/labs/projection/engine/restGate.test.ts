import { describe, expect, it } from 'vitest'
import { quatDeltaDeg, REST_TOLERANCE, RestGate, type ViewSample } from './restGate'

const yaw = (deg: number): ViewSample['quaternion'] => {
  const h = (deg * Math.PI) / 360
  return [0, Math.sin(h), 0, Math.cos(h)]
}
const at = (x: number, yawDeg = 0, fov = 40): ViewSample => ({ position: [x, 1.6, 0], quaternion: yaw(yawDeg), fov })

describe('RestGate', () => {
  it('the first frame counts as a move, an unchanged view does not', () => {
    const g = new RestGate()
    expect(g.moved(at(0))).toBe(true)
    expect(g.moved(at(0))).toBe(false)
  })

  it('jitter inside the tolerance reads as rest', () => {
    const g = new RestGate()
    g.moved(at(0))
    for (let i = 0; i < 100; i++) {
      const s = i % 2 ? 1 : -1
      expect(g.moved(at(s * 0.002, s * 0.04, 40 + s * 0.03))).toBe(false)
    }
  })

  it('drift that adds up past the tolerance counts once, then re-anchors', () => {
    const g = new RestGate()
    g.moved(at(0))
    const moves = Array.from({ length: 100 }, (_, i) => g.moved(at(0, (i + 1) * 0.01))).filter(Boolean)
    // 1° of drift in 0.01° steps: a move each time it passes the tolerance again
    expect(moves.length).toBeGreaterThanOrEqual(Math.floor(1 / (REST_TOLERANCE.degrees + 0.01)))
    expect(moves.length).toBeLessThanOrEqual(Math.ceil(1 / REST_TOLERANCE.degrees))
  })

  it('a lens change alone is a move (a zoom reframes the view)', () => {
    const g = new RestGate()
    g.moved(at(0))
    expect(g.moved(at(0, 0, 40.05))).toBe(false)
    expect(g.moved(at(0, 0, 40.2))).toBe(true)
  })

  it('a position change past ~5 mm is a move', () => {
    const g = new RestGate()
    g.moved(at(0))
    expect(g.moved(at(0.004))).toBe(false)
    expect(g.moved(at(0.006))).toBe(true)
  })

  it('a host-reported active driver counts every frame, however slow', () => {
    const g = new RestGate()
    g.moved(at(0))
    expect(g.moved(at(0), true)).toBe(true)
    expect(g.moved(at(0))).toBe(false)
  })

  it('quatDeltaDeg', () => {
    expect(quatDeltaDeg(yaw(0), yaw(30))).toBeCloseTo(30, 9)
    expect(quatDeltaDeg(yaw(10), yaw(10))).toBe(0)
  })
})
