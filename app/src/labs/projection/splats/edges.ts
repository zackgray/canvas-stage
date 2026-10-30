// The grid's depth-discontinuity rule (math/grid.ts `cut`), restated on a sampled lattice so splats drop exactly
// where the mesh drops triangles. grid.ts keeps it as a closure; edges.test.ts proves the two agree triangle by
// triangle, so a change to one without the other fails.

import { sampleAxis } from '../math/grid'

export const valid = (d: number) => d > 0 && Number.isFinite(d)

export interface Lattice {
  xs: number[]
  ys: number[]
  cols: number
  rows: number
  /** sampled planar depth, NaN = invalid */
  d: Float32Array
}

export function sampleLattice(depth: Float32Array, width: number, height: number, stride: number): Lattice {
  const xs = sampleAxis(width, stride)
  const ys = sampleAxis(height, stride)
  const cols = xs.length
  const rows = ys.length
  const d = new Float32Array(cols * rows)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const z = depth[ys[j] * width + xs[i]]
      d[j * cols + i] = valid(z) ? z : NaN
    }
  }
  return { xs, ys, cols, rows, d }
}

/** Is the lattice edge from (i, j) to (i+di, j+dj) a discontinuity? Same maths as buildGrid's `cut`. */
export function makeCut(l: Lattice, edgeThreshold: number, planeAware: boolean) {
  const { xs, ys, cols, rows, d } = l
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < cols && j < rows ? d[j * cols + i] : NaN)
  const extrapolate = (i: number, j: number, si: number, sj: number, ti: number, tj: number): number => {
    const a = 1 / at(i, j)
    let pred = a
    if (si) {
      const p = at(i - si, j)
      if (!valid(p)) return NaN
      pred += ((a - 1 / p) / (xs[i] - xs[i - si])) * (xs[ti] - xs[i])
    }
    if (sj) {
      const p = at(i, j - sj)
      if (!valid(p)) return NaN
      pred += ((a - 1 / p) / (ys[j] - ys[j - sj])) * (ys[tj] - ys[j])
    }
    return pred
  }
  return (i: number, j: number, di: number, dj: number): boolean => {
    const a = at(i, j)
    const b = at(i + di, j + dj)
    if (!valid(a) || !valid(b)) return true
    if (Math.abs(a - b) / Math.min(a, b) <= edgeThreshold) return false
    if (!planeAware) return true
    const fits = (pred: number, actual: number) => Math.abs(pred - 1 / actual) * actual <= edgeThreshold
    if (fits(extrapolate(i, j, di, dj, i + di, j + dj), b)) return false
    if (fits(extrapolate(i + di, j + dj, -di, -dj, i, j), a)) return false
    if (di && dj) {
      const c = at(i + di, j)
      const e = at(i, j + dj)
      if (valid(c) && valid(e) && fits(1 / c + 1 / e - 1 / a, b)) return false
    }
    return true
  }
}

/** The six grid edges at a lattice vertex, as [di, dj] towards the neighbour (the grid's triangulation). */
export const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]

/**
 * Which side of a cut a vertex is on: 0 = no cut edge to a valid in-range neighbour, 1 = it is the far side of at
 * least one cut, 2 = near side only. Invalid neighbours (sky, outside a settled patch) and the image border never
 * count, so masks and borders are not eroded.
 */
export function edgeSide(l: Lattice, cut: ReturnType<typeof makeCut>, i: number, j: number): 0 | 1 | 2 {
  const a = l.d[j * l.cols + i]
  let side: 0 | 1 | 2 = 0
  for (const [di, dj] of NEIGHBOURS) {
    const ni = i + di
    const nj = j + dj
    if (ni < 0 || nj < 0 || ni >= l.cols || nj >= l.rows) continue
    const b = l.d[nj * l.cols + ni]
    if (!valid(b)) continue
    // cut() is defined for +di/+dj; an edge is the same edge from either end
    const isCut = di < 0 || dj < 0 ? cut(ni, nj, -di, -dj) : cut(i, j, di, dj)
    if (!isCut) continue
    if (a > b) return 1
    side = 2
  }
  return side
}
