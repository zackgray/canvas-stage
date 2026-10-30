import { describe, expect, it } from 'vitest'
import { buildGrid } from '../math/grid'
import { makeCut, sampleLattice } from './edges'

// The splat edge rule must be the grid's, exactly: rebuild the grid's triangle list from makeCut and compare.
const W = 48
const H = 30
const k = { width: W, height: H, vfov: 1 }

/** deterministic scenes: steps, a grazing floor, noise, holes */
function scene(seed: number): Float32Array {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  const d = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const floor = 1 / (0.02 + 0.025 * y)
      const box = x > 10 + (seed % 7) && x < 25 && y > 8 ? 2 + 0.01 * x : Infinity
      const v = Math.min(floor, box) * (1 + 0.03 * (rnd() - 0.5))
      d[y * W + x] = rnd() < 0.02 ? NaN : v
    }
  }
  return d
}

function trianglesFromCut(depth: Float32Array, step: number, edgeThreshold: number, planeAware: boolean): number[] {
  const l = sampleLattice(depth, W, H, step)
  const cut = makeCut(l, edgeThreshold, planeAware)
  const out: number[] = []
  for (let j = 0; j < l.rows - 1; j++) {
    for (let i = 0; i < l.cols - 1; i++) {
      const v00 = j * l.cols + i, v10 = v00 + 1, v01 = v00 + l.cols, v11 = v01 + 1
      const top = cut(i, j, 1, 0), bottom = cut(i, j + 1, 1, 0)
      const left = cut(i, j, 0, 1), right = cut(i + 1, j, 0, 1), diag = cut(i, j, 1, 1)
      if (!top && !right && !diag) out.push(v00, v11, v10)
      if (!diag && !bottom && !left) out.push(v00, v01, v11)
    }
  }
  return out
}

describe('splat edge rule = grid edge rule', () => {
  for (const seed of [1, 2, 3, 4])
    for (const step of [1, 2, 5])
      for (const planeAware of [true, false])
        for (const edgeThreshold of [0.02, 0.04, 0.1]) {
          it(`seed ${seed} step ${step} plane ${planeAware} edge ${edgeThreshold}`, () => {
            const d = scene(seed)
            const g = buildGrid(k, d, { step, edgeThreshold, planeAware })
            const mine = trianglesFromCut(d, step, edgeThreshold, planeAware)
            expect(g.trianglesCut).toBeGreaterThan(0)
            expect(mine).toEqual(Array.from(g.indices))
          })
        }
})
