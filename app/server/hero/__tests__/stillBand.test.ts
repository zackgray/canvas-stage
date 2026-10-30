// The black band at the bottom of Qwen stills (2026-10-23): ground nearer than the 4 m near plane clamped to flat white in the depth
// control, and Qwen drew that flat area as a flat black band. Guards: the control has no flat near-white rows at the bottom of a
// frame whose ground runs under the camera, and the graph resizes without padding, cropping or a different aspect.
import { describe, expect, it } from 'vitest'
import { inverseDepth, nearFor } from '../depthImage.ts'
import { HERO_H, HERO_W } from '../spec.ts'
import { QWEN_H, QWEN_W } from '../kitSpec.ts'
import { buildQwenDepthGraph } from '../qwenGraph.ts'

const W = 96, H = 54
/** a master-like frame: sky above the horizon, ground from 250 m at the horizon down to 1.2 m at the bottom edge */
function groundFrame(): Float32Array {
  const m = new Float32Array(W * H), horizon = 20
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    m[y * W + x] = y < horizon ? NaN : 1.2 + (250 - 1.2) * (1 - (y - horizon) / (H - 1 - horizon)) ** 2
  }
  return m
}
const rowMean = (g: Float32Array, y: number) => { let s = 0; for (let x = 0; x < W; x++) s += g[y * W + x]; return s / W }

describe('depth control keeps near ground graded to the bottom edge', () => {
  it('no run of flat white rows: the last rows still differ from each other and are under full white', () => {
    const m = groundFrame(), inv = inverseDepth(m)
    expect(nearFor(m)).toBeLessThan(4)
    const flat = Array.from({ length: H }, (_, y) => rowMean(inv, y)).filter((v) => v >= 0.999).length
    expect(flat).toBeLessThanOrEqual(2)
    expect(rowMean(inv, H - 8)).toBeLessThan(rowMean(inv, H - 1) - 0.01)
  })
  it('a frame with no near ground keeps the E130 near plane of 4 m', () => {
    expect(nearFor(Float32Array.from(Array.from({ length: 1000 }, (_, i) => 5 + i / 10)))).toBe(4)
  })
})

describe('the draw fills 1920x1088 edge to edge', () => {
  const g = buildQwenDepthGraph({ prompt: 'p', seeds: [7], prefix: 'x' })
  it('the Qwen size is the hero size to within 0.2% of aspect, so the Lanczos stretch is invisible', () => {
    expect(Math.abs(QWEN_W / QWEN_H / (HERO_W / HERO_H) - 1)).toBeLessThan(0.002)
  })
  it('both ImageScale nodes stretch to the full target (crop disabled), and no pad or crop node exists', () => {
    expect(g.ds.inputs).toMatchObject({ width: QWEN_W, height: QWEN_H, crop: 'disabled' })
    expect(g.u7.inputs).toMatchObject({ width: HERO_W, height: HERO_H, crop: 'disabled' })
    const kinds = Object.values(g).map((n) => n.class_type)
    expect(kinds.filter((k) => /Pad|Crop/.test(k))).toEqual([])
  })
})
