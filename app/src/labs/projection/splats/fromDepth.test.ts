import { describe, expect, it } from 'vitest'
import { buildGrid, sampleAxis } from '../math/grid'
import { depthToSplats, focalPx, splatSigma, type DepthSplatSource } from './fromDepth'

const W = 64
const H = 32
const vfov = Math.PI / 3
const fill = (fn: (x: number, y: number) => number) => {
  const d = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = fn(x, y)
  return d
}
const rgba = new Uint8Array(W * H * 4).map((_, i) => (i * 7) % 251)
const src = (depth: Float32Array, mask?: Uint8Array): DepthSplatSource => ({ rgba, depth, width: W, height: H, vfov, mask })
const f = focalPx(vfov, H)
/** smooth, off-axis-heavy surface: a tilted wavy wall */
const wavy = fill((x, y) => 3 + 0.04 * x + 0.5 * Math.sin(x / 9) * Math.cos(y / 7))

describe('depth -> splats: placement', () => {
  for (const stride of [1, 2, 3]) {
    it(`splat centre is the grid vertex for the same pixel (stride ${stride})`, () => {
      const g = buildGrid({ width: W, height: H, vfov }, wavy, { step: stride, edgeThreshold: 0.04, planeAware: true })
      const s = depthToSplats(src(wavy), { stride, edgeRing: 'off' })
      const xs = sampleAxis(W, stride)
      const ys = sampleAxis(H, stride)
      expect(s.count).toBe(g.cols * g.rows)
      let worst = 0
      for (let c = 0; c < s.count; c++) {
        const px = s.pixels[c] % W
        const py = Math.floor(s.pixels[c] / W)
        const v = ys.indexOf(py) * g.cols + xs.indexOf(px)
        for (let a = 0; a < 3; a++) worst = Math.max(worst, Math.abs(s.centers[c * 3 + a] - g.positions[v * 3 + a]))
      }
      expect(worst).toBeLessThan(1e-6)
    })
  }

  it('uses planar depth: centre z is exactly -depth, even in the corners', () => {
    const s = depthToSplats(src(fill(() => 5)), { edgeRing: 'off' })
    const corner = s.pixels.indexOf(0)
    expect(s.centers[corner * 3 + 2]).toBeCloseTo(-5, 6)
    expect(Math.hypot(s.centers[0], s.centers[1], s.centers[2])).toBeGreaterThan(6)
  })

  it('takes the colour of its own pixel', () => {
    const s = depthToSplats(src(wavy), { stride: 3, edgeRing: 'off' })
    const c = 17
    const p = s.pixels[c]
    expect(Array.from(s.colors.subarray(c * 3, c * 3 + 3))).toEqual([rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]])
  })
})

describe('depth -> splats: skipping', () => {
  it('skips NaN, zero, negative and infinite depth, and masked pixels', () => {
    const bad = new Set([5, 70, 300, 1000])
    const d = fill((x, y) => {
      const i = y * W + x
      return i === 5 ? NaN : i === 70 ? 0 : i === 300 ? -1 : i === 1000 ? Infinity : 4
    })
    const mask = new Uint8Array(W * H).fill(1)
    mask[2000] = 0
    const s = depthToSplats(src(d, mask))
    expect(s.dropped).toEqual({ invalid: 4, masked: 1, edge: 0 }) // invalid neighbours never erode
    expect(s.count).toBe(W * H - 5)
    for (const p of s.pixels) expect(bad.has(p) || p === 2000).toBe(false)
  })

  it('strides on the grid lattice, last row and column included', () => {
    const s = depthToSplats(src(fill(() => 4)), { stride: 2 })
    expect(s.count).toBe(33 * 17)
    expect(s.pixels).toContain(W * H - 1)
  })
})

describe('depth -> splats: edge ring', () => {
  const step = fill((x) => (x < 32 ? 2 : 6))
  it('drops the ring at a depth step with the grid edge rule (both sides / far side / off)', () => {
    const opts = { stride: 2, edgeThreshold: 0.04, planeAware: true }
    const both = depthToSplats(src(step), { ...opts, edgeRing: 'both' })
    const far = depthToSplats(src(step), { ...opts, edgeRing: 'far' })
    const off = depthToSplats(src(step), { ...opts, edgeRing: 'off' })
    expect(off.dropped.edge).toBe(0)
    expect(far.dropped.edge).toBe(17) // lattice column x = 32 (far side)
    expect(both.dropped.edge).toBe(34) // and x = 30 (near side)
    const xsOf = (s: typeof both) => new Set(Array.from(s.pixels, (p) => p % W))
    expect(xsOf(far).has(32)).toBe(false)
    expect(xsOf(far).has(30)).toBe(true)
    expect(xsOf(both).has(30)).toBe(false)
  })

  it('respects the threshold like the grid', () => {
    const small = fill((x) => (x < 32 ? 2 : 2.06)) // 3 % jump
    expect(depthToSplats(src(small), { edgeThreshold: 0.04 }).dropped.edge).toBe(0)
    expect(depthToSplats(src(small), { edgeThreshold: 0.02 }).dropped.edge).toBe(2 * H)
  })

  it('keeps a grazing floor (plane-aware), drops it when plane-awareness is off', () => {
    const floor = fill((_, y) => 1 / (0.02 + 0.03 * y))
    expect(depthToSplats(src(floor), { stride: 2 }).dropped.edge).toBe(0)
    expect(depthToSplats(src(floor), { stride: 2, planeAware: false }).dropped.edge).toBeGreaterThan(0)
  })
})

describe('depth -> splats: size and orientation', () => {
  it('sigma = stride * depth / (sqrt2 * f * cos), stretch capped', () => {
    const [u, v] = splatSigma(5, 100, 0.5, 2, 6)
    expect(v).toBeCloseTo((2 * 5) / (Math.SQRT2 * 100), 9)
    expect(u).toBeCloseTo(v / 0.5, 9)
    expect(splatSigma(5, 100, 0.01, 1, 6)[0]).toBeCloseTo(6 * splatSigma(5, 100, 1, 1, 6)[1], 9)
    expect(splatSigma(5, 100, 0, 1, 4)[0]).toBeCloseTo(4 * splatSigma(5, 100, 1, 1, 4)[1], 9)
  })

  it('a frontal plane at the image centre gets round, flat splats facing the camera', () => {
    const s = depthToSplats(src(fill(() => 5)), { thickness: 0.05 })
    const c = s.pixels.indexOf((H / 2) * W + W / 2)
    const base = 5 / (Math.SQRT2 * f)
    const [su, sv, sn] = s.scales.subarray(c * 3, c * 3 + 3)
    expect(sv).toBeCloseTo(base, 6)
    expect(su / sv).toBeLessThan(1.01)
    expect(sn).toBeCloseTo(base * 0.05, 6)
    // local +z (the thin axis) maps to the surface normal, towards the camera (+z in camera space)
    const [x, y, z, w] = s.quaternions.subarray(c * 4, c * 4 + 4)
    const nz = 1 - 2 * (x * x + y * y)
    expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 6)
    expect(nz).toBeGreaterThan(0.999)
  })

  it('normals follow the depth gradient; grazing surfaces hit the stretch cap', () => {
    // floor y = -1.6 under a camera looking level: planar depth d = 1.6 / (ny * ty) below the horizon
    const ty = Math.tan(vfov / 2)
    const floor = fill((_, y) => {
      const ny = ((y + 0.5) / H) * 2 - 1
      return ny > 0.05 ? 1.6 / (ny * ty) : NaN
    })
    const s = depthToSplats(src(floor), { maxStretch: 6 })
    let capped = 0
    for (let c = 0; c < s.count; c++) {
      const [x, y, z, w] = s.quaternions.subarray(c * 4, c * 4 + 4)
      // local +z -> world: third column of the rotation matrix
      const n = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
      expect(n[1]).toBeGreaterThan(0.999) // floor normal is +y
      const ratio = s.scales[c * 3] / s.scales[c * 3 + 1]
      expect(ratio).toBeLessThanOrEqual(6 + 1e-6)
      if (ratio > 6 - 1e-6) capped++
    }
    expect(capped).toBeGreaterThan(0)
  })
})
