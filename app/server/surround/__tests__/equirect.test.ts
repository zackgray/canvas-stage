import { describe, expect, it } from 'vitest'
import { assumedUp, dirToUv, footprintShare, levelBasis, panoToStill, stillToPano, toCam, toLevel, upOf, uvToDir } from '../equirect.ts'
import type { Vec3 } from '../types.ts'

const STILL = { width: 1920, height: 1088, vfovDeg: 50.37814521763879 }
const UPS: Vec3[] = [assumedUp(), [-0.0018, 0.99909, -0.04271], [-0.00184, 0.99749, -0.07072], [0.1, 0.96, 0.26]]
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('level frame', () => {
  it('is a rotation whose Y is the given up, and whose -Z is the still forward levelled', () => {
    for (const up of UPS) {
      const R = levelBasis(up)
      const u = Math.hypot(...up)
      const y = toCam(R, [0, 1, 0])
      for (let i = 0; i < 3; i++) close(y[i], up[i] / u)
      close(toCam(R, [1, 0, 0])[0] ** 2 + toCam(R, [1, 0, 0])[1] ** 2 + toCam(R, [1, 0, 0])[2] ** 2, 1)
      const fwd = toCam(R, [0, 0, -1])
      close(fwd[0] * y[0] + fwd[1] * y[1] + fwd[2] * y[2], 0) // forward is level (perpendicular to up)
      const back = toLevel(R, toCam(R, [0.3, 0.5, -0.8]))
      close(back[0], 0.3); close(back[1], 0.5); close(back[2], -0.8)
    }
  })

  it('a missing level.json is the app\'s assumed pitch, and a level.json is used as is', () => {
    expect(upOf(null)).toEqual(assumedUp())
    expect(upOf({ up: [0, 1, 0] })).toEqual([0, 1, 0])
    close(assumedUp()[1], Math.cos((4.3 * Math.PI) / 180))
  })
})

describe('equirect', () => {
  it('uv <-> direction: the centre column is the still\'s levelled forward, v = 0 is straight up', () => {
    expect(uvToDir(0.5, 0.5)[2]).toBeCloseTo(-1)
    expect(uvToDir(0.5, 0)[1]).toBeCloseTo(1)
    for (const [u, v] of [[0.1, 0.3], [0.5, 0.5], [0.93, 0.8], [0.25, 0.5]]) {
      const [u2, v2] = dirToUv(uvToDir(u, v))
      close(u2, u); close(v2, v)
    }
  })
})

describe('the still placed in the canvas', () => {
  it('a still pixel -> equirect -> back returns the pixel, for each up vector and across the frame', () => {
    for (const up of UPS) {
      const R = levelBasis(up)
      for (const [px, py] of [[0, 0], [1919, 0], [0, 1087], [1919, 1087], [960, 544], [333, 777], [1500, 100]]) {
        const [u, v] = stillToPano(R, STILL, px, py)
        const back = panoToStill(R, STILL, u, v)
        expect(back).not.toBeNull()
        close(back![0], px, 1e-4); close(back![1], py, 1e-4)
      }
    }
  })

  it('directions outside the still\'s frame (behind it, above its top) map to nothing', () => {
    const R = levelBasis(assumedUp())
    expect(panoToStill(R, STILL, 0.0, 0.5)).toBeNull() // 180 deg yaw: behind the camera
    expect(panoToStill(R, STILL, 0.5, 0.05)).toBeNull() // near the zenith
  })

  it('the frame centre lands within a few degrees of the centre column, off the horizon by the camera pitch', () => {
    const [u, v] = stillToPano(levelBasis(assumedUp()), STILL, 959.5, 543.5)
    close(u, 0.5, 1e-6)
    close(v, 0.5 + (4.3 / 180) , 1e-4) // the assumed 4.3 deg down-pitch: forward is below the horizon
  })

  it('agrees with scripts/surround_canvas.py: its footprint on the warehouse location covers 5.74 % of the canvas pixels (measured)', () => {
    const R = levelBasis(UPS[1])
    const [W, H] = [512, 256]
    let inside = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (panoToStill(R, STILL, (x + 0.5) / W, (y + 0.5) / H)) inside++
    // the script measured 5.74 % at 2048 x 1024 (the footprint before its border is eroded)
    expect((inside / (W * H)) * 100).toBeGreaterThan(5.5)
    expect((inside / (W * H)) * 100).toBeLessThan(6.1)
    expect(footprintShare(STILL) * 100).toBeCloseTo(8.76, 0) // the solid angle, for the status line
  })
})
