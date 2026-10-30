import { describe, expect, it } from 'vitest'
import { encodeInverse16 } from '../../../src/labs/projection/math/depth.ts'
import { fitInverse, mogeMetres, quantiseMetres } from '../moge.ts'
import { chooseAlignment, settleDepth, skyMask } from '../process.ts'
import { A, B, FAR, H, MOGE_SCALE_ERR, NEAR, scene, SKY_ROWS, VFOV, W } from './synthetic.ts'

describe('MoGe -> metres', () => {
  it('recovers the inverse-depth affine map and the vertical FOV from the point map', () => {
    const s = scene()
    const f = fitInverse(s.points.positions, s.points.uvs, s.moge)
    expect(f.a).toBeCloseTo(A, 6)
    expect(f.b).toBeCloseTo(B, 6)
    expect(f.r2).toBeCloseTo(1, 9)
    expect(f.vfovDeg).toBeCloseTo(VFOV, 4)
  })
  it('converts to metres and leaves invalid pixels NaN', () => {
    const s = scene()
    const z = mogeMetres(s.moge, { a: A, b: B }, s.mogeValid)
    expect(z[0]).toBeNaN()
    const i = 30 * W + 5
    expect(z[i]).toBeCloseTo(s.truth[i] / MOGE_SCALE_ERR, 4)
  })
  it('quantises to 16-bit linear with 0 = invalid and max -> 65535', () => {
    const q = quantiseMetres(new Float32Array([NaN, 0, 2, 4]))
    expect(Array.from(q.values)).toEqual([0, 0, 32768, 65535])
    expect(q.metersPerUnit).toBeCloseTo(4 / 65535, 12)
  })
})

describe('alignment wiring', () => {
  it('a settled view lands on the set: scale recovered, depth in metres, holes filled, sky apart', () => {
    const s = scene()
    const r = settleDepth({ width: W, height: H, refRaw: s.refRaw, near: NEAR, far: FAR, holes: s.holes, moge: s.moge, mogeValid: s.mogeValid, points: s.points })
    expect(r.applied).toBe('scale only')
    expect(r.alignment.scale).toBeCloseTo(MOGE_SCALE_ERR, 3)
    expect(r.alignment.rmse).toBeLessThan(0.01)
    // a hole pixel away from the box edge gets the true depth
    const i = 25 * W + 20
    expect(s.holes[i]).toBe(1)
    expect(r.depth[i]).toBeCloseTo(s.truth[i], 2)
    // hole rows 2..5 are sky (16 x 4 px); the rest of the hole is filled
    let holes = 0
    for (const h of s.holes) holes += h
    expect(r.holesBefore).toBeCloseTo(holes / (W * H), 9)
    expect(r.skyFraction).toBeCloseTo((16 * (SKY_ROWS - 2)) / (W * H), 9)
    expect(r.holesAfter).toBe(0)
  })
  it('outliers in the overlap do not drag the fit (robust start)', () => {
    const s = scene()
    // ~15 % of the overlap: the set and MoGe disagree wildly (thin geometry) — the set reads ~8x farther there
    for (let i = 0; i < s.refRaw.length; i += 7) if (s.refRaw[i]) s.refRaw[i] = Math.max(1, s.refRaw[i] >> 3)
    const r = settleDepth({ width: W, height: H, refRaw: s.refRaw, near: NEAR, far: FAR, holes: s.holes, moge: s.moge, mogeValid: s.mogeValid, points: s.points })
    expect(Number.isFinite(r.alignment.scale)).toBe(true)
    expect(r.alignment.scale).toBeCloseTo(MOGE_SCALE_ERR, 2)
  })
  it('reference pixels clamped at export (pinned at far) do not vote, even when they are the majority', () => {
    const s = scene()
    // an export whose far end is short of the wall (8..9.9 m): ~3/4 of the wall saturates at raw 1 = "8.5 m"
    const farShort = 8.5
    const refRaw = encodeInverse16(s.truth.map((d, i) => (s.holes[i] ? NaN : d)), NEAR, farShort)
    let pinned = 0
    for (const v of refRaw) if (v === 1) pinned++
    expect(pinned).toBeGreaterThan(W * H * 0.4)
    const r = settleDepth({ width: W, height: H, refRaw, near: NEAR, far: farShort, holes: s.holes, moge: s.moge, mogeValid: s.mogeValid, points: s.points })
    expect(r.alignment.scale).toBeCloseTo(MOGE_SCALE_ERR, 3)
    expect(r.alignment.rmse).toBeLessThan(0.01)
  })
  it('throws instead of returning a NaN fit when nothing overlaps', () => {
    const n = W * H
    expect(() => chooseAlignment(new Float32Array(n).fill(NaN), new Float32Array(n).fill(5), new Uint8Array(n))).toThrow(/alignment failed/)
  })
  it('size mismatch is refused', () => {
    const s = scene()
    expect(() => settleDepth({ width: W, height: H - 1, refRaw: s.refRaw, near: NEAR, far: FAR, holes: s.holes, moge: s.moge, mogeValid: s.mogeValid, points: s.points })).toThrow()
  })
})

describe('sky', () => {
  it('only empty regions touching the top edge are sky', () => {
    // 4x3: top-left empty column connected to the top, an enclosed empty pixel at (2,1)
    const inv = new Uint8Array([1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0])
    expect(Array.from(skyMask(inv, 4, 3))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0])
  })
})
