import { describe, expect, it } from 'vitest'
import { convertValue, defaultMode, depthRange, encodeInverse16, normalise, toDepth, viewDepthRange } from './depth'
import { decodeInverse16 } from './settle'

describe('depth conversion', () => {
  it('inverse: near-bright disparity, scale and shift', () => {
    const p = { mode: 'inverse' as const, scale: 1, shift: 0.1 }
    expect(convertValue(1, 'near-bright', p)).toBeCloseTo(1 / 1.1, 9)
    expect(convertValue(0, 'near-bright', p)).toBeCloseTo(10, 9)
    expect(convertValue(0, 'near-dark', p)).toBeCloseTo(1 / 1.1, 9)
    expect(Number.isNaN(convertValue(0, 'near-bright', { ...p, shift: 0 }))).toBe(true)
  })
  it('linear: metric passthrough', () => {
    const p = { mode: 'linear' as const, scale: 65.535, shift: 0 } // 1 mm per 16-bit unit
    expect(convertValue(1000 / 65535, 'near-dark', p)).toBeCloseTo(1, 6)
    expect(convertValue(1, 'near-bright', { ...p, scale: 10, shift: 0.5 })).toBeCloseTo(0.5, 9)
  })
  it('picks a mode from the convention', () => {
    expect(defaultMode('near-bright')).toBe('inverse')
    expect(defaultMode('near-dark')).toBe('linear')
  })
  it('converts whole images and finds the range', () => {
    const img = { width: 3, height: 1, values: normalise([65535, 0, 32768], 65535) }
    const d = toDepth(img, 'near-bright', { mode: 'inverse', scale: 0.9, shift: 0.1 })
    expect(d[0]).toBeCloseTo(1, 6)
    expect(d[1]).toBeCloseTo(10, 6)
    expect(depthRange(d)).toEqual({ min: d[0], max: d[1] })
  })
  it('encodes inverse depth to 16 bits with 0 reserved', () => {
    const e = encodeInverse16(new Float32Array([1, 10, NaN, 2]), 1, 10)
    expect(e[0]).toBe(65535)
    expect(e[1]).toBe(1)
    expect(e[2]).toBe(0)
    expect(e[3]).toBe(Math.round(((0.5 - 0.1) / 0.9) * 65535))
  })
})

describe('view export depth range', () => {
  const source = { min: 2, max: 10 }
  it('a view that sees beyond the source range (backed up / off-angle) encodes without clamping', () => {
    const view = new Float32Array([NaN, 1.5, 2, 6, 10, 18, 25, 0])
    const { near, far } = viewDepthRange(view, source)
    const back = decodeInverse16(encodeInverse16(view, near, far), near, far)
    for (let i = 0; i < view.length; i++) {
      if (view[i] > 0) expect(back[i] / view[i], `depth ${view[i]}`).toBeCloseTo(1, 3)
      else expect(back[i]).toBeNaN()
    }
  })
  it('falls back to the source range only when the view rendered nothing', () => {
    expect(viewDepthRange(new Float32Array([0, NaN]), source)).toEqual({ near: 1, far: 10 })
    expect(viewDepthRange(new Float32Array([4]), source)).toEqual({ near: 2, far: 4 })
  })
})
