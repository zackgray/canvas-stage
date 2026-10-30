// Displaced grid mesh from a depth image, in projector camera space.
// One vertex per `step` pixels (at pixel centres), pushed along its camera ray to its depth. Triangles
// spanning a depth discontinuity are dropped so disocclusions open as clean holes instead of rubber sheets.

import { unprojectPixel, type Intrinsics } from './camera'

export interface GridOptions {
  /** pixels between vertices (>= 1) */
  step: number
  /** relative depth jump that counts as a discontinuity, e.g. 0.04 = 4 % */
  edgeThreshold: number
  /**
   * Keep large jumps that continue a plane (inverse depth is linear across a plane in image space), so
   * grazing floors and walls are not shredded. Real steps fail the prediction from both sides.
   */
  planeAware: boolean
  /**
   * Cut a triangle seen this close to edge-on from the projector (angle between its normal and the projector's ray,
   * degrees; undefined or >= 90 = off). A soft depth edge — a column against the far wall that the depth model ramps
   * over a few pixels — passes the jump test as a "plane" but is a sheet almost along the ray: seen from anywhere else it
   * stretches into a long streak that CrossView takes as real. Cut, it is a hole (magenta in the warp) and gets
   * filled. A real grazing floor stays under the limit out to a long way (88°: a floor 1.6 m down, ~46 m out).
   */
  grazeDeg?: number
}

export interface GridMesh {
  positions: Float32Array
  /** projector UVs (0,0 bottom-left), for reference; the material projects per fragment */
  uvs: Float32Array
  indices: Uint32Array
  cols: number
  rows: number
  trianglesKept: number
  trianglesCut: number
  /** of the cut, those cut only for grazing (GridOptions.grazeDeg) */
  trianglesGrazing: number
}

export function sampleAxis(size: number, step: number): number[] {
  const s = Math.max(1, Math.round(step))
  const out: number[] = []
  for (let i = 0; i < size; i += s) out.push(i)
  if (out[out.length - 1] !== size - 1) out.push(size - 1)
  return out
}

const valid = (d: number) => d > 0 && Number.isFinite(d)

export function buildGrid(k: Intrinsics, depth: Float32Array, opt: GridOptions): GridMesh {
  const xs = sampleAxis(k.width, opt.step)
  const ys = sampleAxis(k.height, opt.step)
  const cols = xs.length
  const rows = ys.length
  const n = cols * rows
  const positions = new Float32Array(n * 3)
  const uvs = new Float32Array(n * 2)
  const d = new Float32Array(n)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = j * cols + i
      const px = xs[i] + 0.5
      const py = ys[j] + 0.5
      const z = depth[ys[j] * k.width + xs[i]]
      d[v] = valid(z) ? z : NaN
      uvs[v * 2] = px / k.width
      uvs[v * 2 + 1] = 1 - py / k.height
      if (!valid(z)) continue
      const p = unprojectPixel(k, px, py, z)
      positions.set(p, v * 3)
    }
  }

  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < cols && j < rows ? d[j * cols + i] : NaN)
  /**
   * Predict inverse depth at grid (ti, tj) from (i, j), extrapolating the image-space gradient measured
   * against the neighbours behind (i, j) (direction -si, -sj). Handles the irregular last row/column.
   */
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

  /** Is the edge from grid (i,j) to (i+di, j+dj) a discontinuity? */
  const cut = (i: number, j: number, di: number, dj: number): boolean => {
    const a = at(i, j)
    const b = at(i + di, j + dj)
    if (!valid(a) || !valid(b)) return true
    if (Math.abs(a - b) / Math.min(a, b) <= opt.edgeThreshold) return false
    if (!opt.planeAware) return true
    const fits = (pred: number, actual: number) => Math.abs(pred - 1 / actual) * actual <= opt.edgeThreshold
    if (fits(extrapolate(i, j, di, dj, i + di, j + dj), b)) return false
    if (fits(extrapolate(i + di, j + dj, -di, -dj, i, j), a)) return false
    if (di && dj) {
      // diagonal of a planar quad: inverse depth is affine, so the two diagonals share a midpoint
      const c = at(i + di, j)
      const e = at(i, j + dj)
      if (valid(c) && valid(e) && fits(1 / c + 1 / e - 1 / a, b)) return false
    }
    return true
  }

  // |cos| of the angle between a triangle's normal and the projector's ray through its centroid (origin = projector)
  const cosMin = opt.grazeDeg !== undefined && opt.grazeDeg < 90 ? Math.cos((Math.max(0, opt.grazeDeg) * Math.PI) / 180) : -1
  const P = positions
  const grazing = (a: number, b: number, c: number): boolean => {
    if (cosMin < 0) return false
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2]
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az
    const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const rx = ax + (ux + vx) / 3, ry = ay + (uy + vy) / 3, rz = az + (uz + vz) / 3
    const nn = Math.hypot(nx, ny, nz) * Math.hypot(rx, ry, rz)
    return nn > 0 && Math.abs(nx * rx + ny * ry + nz * rz) < cosMin * nn
  }
  const indices: number[] = []
  let cutCount = 0
  let grazeCount = 0
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const v00 = j * cols + i
      const v10 = v00 + 1
      const v01 = v00 + cols
      const v11 = v01 + 1
      const top = cut(i, j, 1, 0)
      const bottom = cut(i, j + 1, 1, 0)
      const left = cut(i, j, 0, 1)
      const right = cut(i + 1, j, 0, 1)
      const diag = cut(i, j, 1, 1)
      // CCW as seen from the projector (y down the grid means image-down)
      if (top || right || diag) cutCount++
      else if (grazing(v00, v11, v10)) { cutCount++; grazeCount++ }
      else indices.push(v00, v11, v10)
      if (diag || bottom || left) cutCount++
      else if (grazing(v00, v01, v11)) { cutCount++; grazeCount++ }
      else indices.push(v00, v01, v11)
    }
  }
  return {
    positions,
    uvs,
    indices: Uint32Array.from(indices),
    cols,
    rows,
    trianglesKept: indices.length / 3,
    trianglesCut: cutCount,
    trianglesGrazing: grazeCount,
  }
}
