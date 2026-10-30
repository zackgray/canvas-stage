import { describe, expect, it } from 'vitest'
import { angleBetweenDeg, isWide, poseDeltaDeg } from './angle'
import { holeStats, type CamSpec, type Quat } from './holes'

const yawQuat = (deg: number): Quat => {
  const h = (deg * Math.PI) / 360
  return [0, Math.sin(h), 0, Math.cos(h)]
}

describe('angles', () => {
  it('measures direction and parallax', () => {
    expect(angleBetweenDeg([0, 0, -1], [1, 0, 0])).toBeCloseTo(90)
    const pivot = [0, 0, -8] as const
    const a = { position: [0, 0, 0] as const, forward: [0, 0, -1] as const }
    // orbit 20° around the pivot: both direction and parallax are 20°
    const r = (20 * Math.PI) / 180
    const b = { position: [8 * Math.sin(r), 0, -8 + 8 * Math.cos(r)] as const, forward: [-Math.sin(r), 0, -Math.cos(r)] as const }
    expect(poseDeltaDeg(a, b, pivot)).toBeCloseTo(20, 6)
    // sliding sideways while looking straight ahead: parallax only
    expect(poseDeltaDeg(a, { position: [8, 0, 0], forward: [0, 0, -1] }, pivot)).toBeCloseTo(45, 6)
    expect(poseDeltaDeg(a, a, pivot)).toBe(0)
    expect(isWide(19.9)).toBe(false)
    expect(isWide(21)).toBe(true)
  })
})

describe('holeStats', () => {
  const cam: CamSpec = { quaternion: [0, 0, 0, 1], vfovDeg: 40, aspect: 2 }
  const src = (w: number, h: number, skyRows: number) => {
    const depth = new Float32Array(w * h).fill(5)
    for (let i = 0; i < skyRows * w; i++) depth[i] = NaN
    return { depth, width: w, height: h }
  }

  it('separates sky from holes from the projector pose', () => {
    // nothing rendered; the still's top half is sky -> half the view is sky, half holes
    const depth = new Float32Array(8 * 4)
    const s = holeStats(depth, 8, 4, cam, cam, src(16, 8, 4))
    expect(s).toMatchObject({ total: 32, sky: 16, holes: 16, fraction: 0.5 })
  })

  it('counts drawn pixels as covered', () => {
    const depth = new Float32Array(8 * 4).fill(3)
    depth[0] = 0
    expect(holeStats(depth, 8, 4, cam, cam, src(16, 8, 0)).fraction).toBeCloseTo(1 / 32)
  })

  it('treats rays outside the still as holes, not sky', () => {
    const depth = new Float32Array(8 * 4)
    const turned = { ...cam, quaternion: yawQuat(90) }
    const s = holeStats(depth, 8, 4, turned, cam, src(16, 8, 8))
    expect(s.sky).toBe(0)
    expect(s.fraction).toBe(1)
  })

  it('counts every gap as a hole without a source', () => {
    expect(holeStats(new Float32Array(4), 2, 2, cam, cam, null).fraction).toBe(1)
  })
})
