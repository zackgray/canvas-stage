import { describe, expect, it } from 'vitest'
import {
  focalFromHfov, focalFromVfov, hfovFromFocal, projectPoint, toDeg, unprojectDepth, unprojectPixel, vfovFromFocal,
} from './camera'

describe('focal length <-> field of view (36 mm sensor)', () => {
  it('matches known full-frame values', () => {
    expect(toDeg(hfovFromFocal(50))).toBeCloseTo(39.598, 2)
    expect(toDeg(hfovFromFocal(35))).toBeCloseTo(54.432, 2)
    expect(toDeg(vfovFromFocal(50, 3 / 2))).toBeCloseTo(26.991, 2) // 24 mm tall
    expect(toDeg(vfovFromFocal(24, 16 / 9))).toBeCloseTo(45.75, 1)
  })
  it('round-trips', () => {
    for (const f of [14, 24, 35, 50, 85, 200]) {
      expect(focalFromHfov(hfovFromFocal(f))).toBeCloseTo(f, 9)
      expect(focalFromVfov(vfovFromFocal(f, 16 / 9), 16 / 9)).toBeCloseTo(f, 9)
    }
  })
})

describe('unprojection', () => {
  const k = { width: 160, height: 90, vfov: vfovFromFocal(35, 16 / 9) }
  it('puts the image centre on the optical axis', () => {
    const [x, y, z] = unprojectPixel(k, 80, 45, 5)
    expect(x).toBeCloseTo(0, 12)
    expect(y).toBeCloseTo(0, 12)
    expect(z).toBe(-5)
  })
  it('puts the image corner on the frustum edge', () => {
    const [x, y] = unprojectPixel(k, 0, 0, 2)
    expect(y).toBeCloseTo(2 * Math.tan(k.vfov / 2), 12)
    expect(x).toBeCloseTo(-2 * Math.tan(hfovFromFocal(35) / 2), 12)
  })
  it('inverts projectPoint', () => {
    const p = unprojectPixel(k, 12.3, 77.7, 3.21)
    const [px, py, d] = projectPoint(k, ...p)
    expect(px).toBeCloseTo(12.3, 9)
    expect(py).toBeCloseTo(77.7, 9)
    expect(d).toBeCloseTo(3.21, 9)
  })
  it('unprojects a depth image and flags invalid pixels', () => {
    const small = { width: 2, height: 2, vfov: Math.PI / 2 }
    const pts = unprojectDepth(small, new Float32Array([1, 2, 0, NaN]))
    expect(pts[2]).toBe(-1)
    expect(pts[5]).toBe(-2)
    expect(Number.isNaN(pts[6])).toBe(true)
    expect(Number.isNaN(pts[9])).toBe(true)
    expect(pts[0]).toBeCloseTo(-0.5, 6) // tan(45deg) * (0.25 * 2 - 1) * 1
  })
})
