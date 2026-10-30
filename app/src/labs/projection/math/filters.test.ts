import { describe, expect, it } from 'vitest'
import { dequantize, sharpenEdges } from './filters'
import { buildGrid } from './grid'

const W = 48, H = 8
const fill = (fn: (x: number, y: number) => number) => {
  const d = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = fn(x, y)
  return d
}
const row = (d: Float32Array, y = 4) => Array.from(d.subarray(y * W, (y + 1) * W))

describe('sharpenEdges', () => {
  // a 15 % step (depth 2 -> 2.3) blurred in inverse depth over ~8 px, like a depth model's soft boundary;
  // every 2 px mesh step is under the 4 % threshold, so unsharpened it meshes as a rubber sheet
  const soft = fill((x) => 1 / (0.5 - 0.065 / (1 + Math.exp(-(x - 24) / 2))))

  it('turns a blurred step into a hard one', () => {
    const sharp = row(sharpenEdges(soft, W, H, 4, 0.04))
    const snapped = sharp.filter((v) => Math.abs(v - 2) < 0.03 || Math.abs(v - 2.3) < 0.03).length
    expect(snapped).toBeGreaterThan(row(soft).filter((v) => Math.abs(v - 2) < 0.03 || Math.abs(v - 2.3) < 0.03).length)
    const mesh = (d: Float32Array) => buildGrid({ width: W, height: H, vfov: 1 }, d, { step: 2, edgeThreshold: 0.04, planeAware: true })
    expect(mesh(soft).trianglesCut).toBe(0) // the rubber sheet
    expect(mesh(sharpenEdges(soft, W, H, 4, 0.04)).trianglesCut).toBeGreaterThan(0)
  })

  it('leaves a long ramp (a floor) alone', () => {
    const floor = fill((x) => 1 / (0.05 + 0.02 * x))
    expect(row(sharpenEdges(floor, W, H, 4, 0.04))).toEqual(row(floor))
  })

  it('is a no-op at radius 0', () => {
    expect(sharpenEdges(soft, W, H, 0, 0.04)).toBe(soft)
  })
})

describe('dequantize', () => {
  it('smooths 8-bit terraces but keeps a real edge', () => {
    const v = fill((x) => (x < 24 ? Math.round((40 + x * 0.3) ) / 255 : 200 / 255))
    const out = row(dequantize(v, W, H, 4, 2.5 / 255))
    // terrace region: steps shrink
    const maxStep = (r: number[]) => Math.max(...r.slice(2, 20).map((x, i, a) => (i ? Math.abs(x - a[i - 1]) : 0)))
    expect(maxStep(out)).toBeLessThan(maxStep(row(v)))
    // the edge at x = 24 survives
    expect(out[23]).toBeLessThan(60 / 255)
    expect(out[24]).toBeGreaterThan(190 / 255)
  })
})
