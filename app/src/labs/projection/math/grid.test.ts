import { describe, expect, it } from 'vitest'
import { buildGrid, sampleAxis } from './grid'
import { projectPoint, unprojectPixel } from './camera'

const k = { width: 64, height: 32, vfov: Math.PI / 3 }
const opts = { step: 2, edgeThreshold: 0.04, planeAware: true }
const fill = (fn: (x: number, y: number) => number) => {
  const d = new Float32Array(k.width * k.height)
  for (let y = 0; y < k.height; y++) for (let x = 0; x < k.width; x++) d[y * k.width + x] = fn(x, y)
  return d
}

describe('grid mesh', () => {
  it('samples every step and always includes the last pixel', () => {
    expect(sampleAxis(10, 3)).toEqual([0, 3, 6, 9])
    expect(sampleAxis(10, 4)).toEqual([0, 4, 8, 9])
    expect(sampleAxis(3, 1)).toEqual([0, 1, 2])
  })

  it('keeps every triangle of a flat plane and places vertices on their rays', () => {
    const g = buildGrid(k, fill(() => 5), opts)
    expect(g.cols).toBe(33)
    expect(g.rows).toBe(17)
    expect(g.trianglesCut).toBe(0)
    expect(g.trianglesKept).toBe(32 * 16 * 2)
    const idx = 1 * g.cols + 3 // grid (3, 1) = pixel (6, 2)
    const p = Array.from(g.positions.subarray(idx * 3, idx * 3 + 3))
    const e = unprojectPixel(k, 6.5, 2.5, 5)
    p.forEach((c, i) => expect(c).toBeCloseTo(e[i], 5))
    const [px, py] = projectPoint(k, p[0], p[1], p[2])
    expect(px / k.width).toBeCloseTo(g.uvs[idx * 2], 5)
    expect(1 - py / k.height).toBeCloseTo(g.uvs[idx * 2 + 1], 5)
  })

  it('cuts a depth step into a clean hole, one quad wide', () => {
    const g = buildGrid(k, fill((x) => (x < 32 ? 2 : 6)), opts)
    expect(g.trianglesCut).toBe(16 * 2) // the column of quads spanning x = 30..32
    expect(g.trianglesKept).toBe(31 * 16 * 2)
  })

  it('respects the threshold', () => {
    const step = fill((x) => (x < 32 ? 2 : 2.06)) // 3 % jump
    expect(buildGrid(k, step, opts).trianglesCut).toBe(0)
    expect(buildGrid(k, step, { ...opts, edgeThreshold: 0.02 }).trianglesCut).toBe(16 * 2)
  })

  it('keeps a grazing floor whose per-step jumps exceed the threshold (plane-aware)', () => {
    // a floor: inverse depth is linear in image rows; adjacent rows differ by far more than 4 %
    const floor = fill((_, y) => 1 / (0.02 + 0.03 * y))
    const aware = buildGrid(k, floor, opts)
    const naive = buildGrid(k, floor, { ...opts, planeAware: false })
    expect(aware.trianglesCut).toBe(0)
    expect(naive.trianglesCut).toBeGreaterThan(0)
  })

  it('still cuts a step in front of a grazing floor', () => {
    const scene = fill((x, y) => (x >= 20 && x < 30 ? 1.5 : 1 / (0.02 + 0.03 * y)))
    const g = buildGrid(k, scene, opts)
    expect(g.trianglesCut).toBeGreaterThan(0)
  })

  it('drops triangles touching invalid depth', () => {
    const g = buildGrid(k, fill((x, y) => (x === 0 && y === 0 ? NaN : 3)), opts)
    expect(g.trianglesCut).toBe(2)
  })

  describe('grazing cut', () => {
    // a narrow lens (focal 320 px), so a soft depth edge a few pixels wide is a sheet almost along the ray, as at 960 px
    const tele = { width: 64, height: 32, vfov: 0.1 }
    const ramp = () => {
      const d = new Float32Array(64 * 32)
      for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
        const t = Math.min(1, Math.max(0, (x - 30) / 4)) // inverse depth linear over 4 px: 2 m -> 6 m, a "plane" to the jump test
        d[y * 64 + x] = 1 / (0.5 - t * (0.5 - 1 / 6))
      }
      return d
    }

    it('keeps a soft depth edge as a sheet without it (plane-aware), cuts it with it', () => {
      const off = buildGrid(tele, ramp(), opts)
      const on = buildGrid(tele, ramp(), { ...opts, grazeDeg: 86 })
      expect(off.trianglesCut).toBe(0)
      expect(off.trianglesGrazing).toBe(0)
      expect(on.trianglesGrazing).toBe(2 * 2 * 16) // the two quad columns spanning x = 30..34
      expect(on.trianglesCut).toBe(on.trianglesGrazing)
      expect(buildGrid(tele, ramp(), { ...opts, grazeDeg: 90 }).trianglesKept).toBe(off.trianglesKept)
    })

    it('keeps a fronto-parallel wall and a real floor out to 20 m', () => {
      expect(buildGrid(tele, new Float32Array(64 * 32).fill(8), { ...opts, grazeDeg: 86 }).trianglesCut).toBe(0)
      // a floor 1.6 m below the projector, rows from ~20 m out to the bottom of the frame (60° lens)
      const f = 16 / Math.tan(k.vfov / 2)
      const floor = fill((_, y) => { const r = y + 0.5 - 16; return r > 0 && (1.6 * f) / r <= 20 ? (1.6 * f) / r : NaN })
      const g = buildGrid(k, floor, { ...opts, grazeDeg: 86 })
      expect(g.trianglesKept).toBeGreaterThan(0)
      expect(g.trianglesGrazing).toBe(0)
    })
  })
})
