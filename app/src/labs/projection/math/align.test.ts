import { describe, expect, it } from 'vitest'
import { alignDepth, applyAlignment, dilateMask, fitRegion } from './align'
import { encodeInverse16 } from './depth'
import { decodeInverse16, holeOnlyDepth, maskFromGrey } from './settle'

const W = 8
const H = 6
const ramp = () => Float32Array.from({ length: W * H }, (_, i) => 3 + (i % W) * 0.5 + Math.floor(i / W) * 0.25)
const all = (n: number) => new Uint8Array(n).fill(1)

describe('alignDepth', () => {
  it('recovers a pure scale exactly', () => {
    const src = ramp()
    const ref = src.map((d) => d * 1.37)
    const a = alignDepth(src, ref, all(src.length))
    expect(a.scale).toBeCloseTo(1.37, 6)
    expect(a.shift).toBe(0)
    expect(a.rmse).toBeLessThan(1e-5)
    expect(a.n).toBe(src.length)
  })

  it('recovers scale and shift when the shift is enabled', () => {
    const src = ramp()
    const ref = src.map((d) => d * 0.8 + 0.6)
    const a = alignDepth(src, ref, all(src.length), { shift: true })
    expect(a.scale).toBeCloseTo(0.8, 6)
    expect(a.shift).toBeCloseTo(0.6, 6)
    const scaleOnly = alignDepth(src, ref, all(src.length))
    expect(scaleOnly.rmse).toBeGreaterThan(a.rmse)
  })

  it('trims gross outliers and reports what they cost before trimming', () => {
    const src = ramp()
    const ref = src.map((d) => d * 2)
    ref[5] = 100
    ref[17] = 0.5
    const a = alignDepth(src, ref, all(src.length))
    expect(a.scale).toBeCloseTo(2, 6)
    expect(a.n).toBe(src.length - 2)
    expect(a.all.n).toBe(src.length)
    expect(a.all.rmse).toBeGreaterThan(a.rmse)
    expect(a.medianRel).toBeLessThan(1e-6 * 10)
  })

  it('ignores pixels outside the region', () => {
    const src = ramp()
    const ref = src.map((d) => d * 3)
    const use = all(src.length)
    for (let i = 0; i < 10; i++) { ref[i] = 999; use[i] = 0 }
    const a = alignDepth(src, ref, use, { passes: 0 })
    expect(a.scale).toBeCloseTo(3, 6)
  })

  it('applyAlignment keeps invalid at 0', () => {
    const out = applyAlignment(Float32Array.from([1, NaN, 0, 2]), { scale: 2, shift: 0.5 })
    expect(Array.from(out)).toEqual([2.5, 0, 0, 4.5])
  })
})

describe('masks', () => {
  it('dilates by a square radius and clamps at the border', () => {
    const m = new Uint8Array(W * H)
    m[2 * W + 3] = 1
    const d = dilateMask(m, W, H, 1)
    let on = 0
    for (const v of d) on += v
    expect(on).toBe(9)
    expect(d[1 * W + 2]).toBe(1)
    expect(d[3 * W + 4]).toBe(1)
    expect(d[0]).toBe(0)
    m.fill(0); m[0] = 1
    expect(dilateMask(m, W, H, 2).reduce((s, v) => s + v, 0)).toBe(9)
  })

  it('fitRegion keeps a margin from holes and needs both depths valid', () => {
    const src = ramp()
    const ref = ramp()
    ref[W * H - 1] = NaN
    const holes = new Uint8Array(W * H)
    holes[0] = 1
    const use = fitRegion(src, ref, holes, W, H, 1)
    expect(use[0]).toBe(0)
    expect(use[1]).toBe(0)
    expect(use[W + 1]).toBe(0)
    expect(use[2]).toBe(1)
    expect(use[W * H - 1]).toBe(0)
  })

  it('holeOnlyDepth keeps depth only inside the grown hole mask', () => {
    const depth = ramp()
    const holes = maskFromGrey(Float32Array.from({ length: W * H }, (_, i) => (i === 2 * W + 3 ? 1 : 0)))
    const tight = holeOnlyDepth(depth, holes, W, H, 0)
    expect(tight[2 * W + 3]).toBe(depth[2 * W + 3])
    expect(Number.isNaN(tight[2 * W + 4])).toBe(true)
    const grown = holeOnlyDepth(depth, holes, W, H, 1)
    expect(grown[2 * W + 4]).toBe(depth[2 * W + 4])
    expect(Number.isNaN(grown[0])).toBe(true)
  })

  it('decodeInverse16 inverts the lab export encoding', () => {
    const depth = Float32Array.from([3.6, 5, 12.5, 60, NaN])
    const back = decodeInverse16(encodeInverse16(depth, 3.6, 60), 3.6, 60)
    for (let i = 0; i < 4; i++) expect(Math.abs(back[i] - depth[i]) / depth[i]).toBeLessThan(2e-3)
    expect(Number.isNaN(back[4])).toBe(true)
  })
})
