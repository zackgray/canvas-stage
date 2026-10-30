// Still + planar depth -> one Gaussian splat per (strided) pixel, no optimisation. Pure; no three.js, no React.
//
// Placement is the grid's: pixel centre pushed along its camera ray to planar depth (math/camera unprojectPixel),
// on the same sampled lattice (sampleAxis), so a splat centre is the mesh vertex for that pixel. Sizing follows
// WonderWorld: in-plane sigma = stride * depth / (sqrt2 * f * cos theta), f = focal in px, theta = angle between the
// view ray and the surface normal (from the depth gradient). The 1/cos stretch goes on the tilt axis only, capped
// at maxStretch so grazing floors don't make giant splats. Splats are flat: thin along the normal. A ring of splats
// at depth discontinuities is dropped using the grid's own edge rule (edges.ts).

import { unprojectPixel, type Intrinsics } from '../math/camera'
import { edgeSide, makeCut, sampleLattice, valid } from './edges'
import { quatFromBasis } from './splatMath'

export interface DepthSplatSource {
  /** RGBA8 (sRGB), top row first, at the depth's resolution */
  rgba: ArrayLike<number>
  /** planar metres (z distance, not ray length), top row first; NaN / <= 0 = invalid */
  depth: Float32Array
  width: number
  height: number
  /** projector vertical FOV, radians; aspect is width / height, as in buildGrid */
  vfov: number
  /** optional validity mask at the same size: 0 = no splat (1 = keep) */
  mask?: Uint8Array
}

/** Which splats at a depth edge to drop: both sides (WorldGen), only the far side, or none. */
export type EdgeRing = 'both' | 'far' | 'off'

export interface SplatOptions {
  /** pixels between splats (>= 1), same lattice as the grid's `step` */
  stride: number
  /** relative depth jump treated as an edge; same meaning as GridOptions.edgeThreshold */
  edgeThreshold: number
  /** same meaning as GridOptions.planeAware */
  planeAware: boolean
  edgeRing: EdgeRing
  /** cap on the 1 / cos theta stretch */
  maxStretch: number
  /** normal-axis sigma as a fraction of the in-plane sigma */
  thickness: number
  /** LINEAR opacity in [0, 1] (Spark's convention; see splatMath) */
  opacity: number
}

export const DEFAULT_SPLAT_OPTIONS: SplatOptions = {
  stride: 1, edgeThreshold: 0.04, planeAware: true, edgeRing: 'both', maxStretch: 6, thickness: 0.05, opacity: 1,
}

export interface DepthSplats {
  count: number
  /** projector camera space (three.js: +x right, +y up, looking down -z), xyz per splat */
  centers: Float32Array
  /** sRGB bytes, rgb per splat */
  colors: Uint8Array
  /** linear [0, 1] */
  opacities: Float32Array
  /** sigma per local axis: x = tilt axis, y = across, z = normal */
  scales: Float32Array
  /** [x, y, z, w] per splat, local frame -> projector camera space */
  quaternions: Float32Array
  /** source pixel index (y * width + x) per splat */
  pixels: Uint32Array
  dropped: { invalid: number; masked: number; edge: number }
}

/** Focal length in pixels for a vertical FOV and image height. */
export const focalPx = (vfov: number, height: number) => height / (2 * Math.tan(vfov / 2))

/** In-plane sigmas [tilt axis, across] for planar depth d, focal f (px), cos theta, stride. */
export function splatSigma(d: number, f: number, cos: number, stride: number, maxStretch: number): [number, number] {
  const base = (stride * d) / (Math.SQRT2 * f)
  const stretch = Math.min(maxStretch, 1 / Math.max(Math.abs(cos), 1e-9))
  return [base * stretch, base]
}

export function depthToSplats(src: DepthSplatSource, options: Partial<SplatOptions> = {}): DepthSplats {
  const opt = { ...DEFAULT_SPLAT_OPTIONS, ...options }
  const stride = Math.max(1, Math.round(opt.stride))
  const { width, height } = src
  const k: Intrinsics = { width, height, vfov: src.vfov }
  const f = focalPx(src.vfov, height)

  const l = sampleLattice(src.depth, width, height, stride)
  const { xs, ys, cols, rows, d } = l
  const cut = makeCut(l, opt.edgeThreshold, opt.planeAware)
  const pos = new Float32Array(cols * rows * 3)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = j * cols + i
      if (valid(d[v])) pos.set(unprojectPixel(k, xs[i] + 0.5, ys[j] + 0.5, d[v]), v * 3)
    }
  }

  const n = cols * rows
  const centers = new Float32Array(n * 3)
  const colors = new Uint8Array(n * 3)
  const opacities = new Float32Array(n)
  const scales = new Float32Array(n * 3)
  const quaternions = new Float32Array(n * 4)
  const pixels = new Uint32Array(n)
  const dropped = { invalid: 0, masked: 0, edge: 0 }
  const tan = [0, 0, 0, 0, 0, 0]
  /** Tangent along lattice axis (di, dj) from uncut neighbours, written to tan[o..o+2]; false if none. */
  const tangent = (i: number, j: number, di: number, dj: number, o: number): boolean => {
    const ok = (s: number) => {
      const ni = i + s * di
      const nj = j + s * dj
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || !valid(d[nj * cols + ni])) return false
      return s > 0 ? !cut(i, j, di, dj) : !cut(ni, nj, di, dj)
    }
    const hi = ok(1) ? 1 : 0
    const lo = ok(-1) ? -1 : 0
    if (hi === lo) return false
    const a = ((j + lo * dj) * cols + i + lo * di) * 3
    const b = ((j + hi * dj) * cols + i + hi * di) * 3
    tan[o] = pos[b] - pos[a]
    tan[o + 1] = pos[b + 1] - pos[a + 1]
    tan[o + 2] = pos[b + 2] - pos[a + 2]
    return true
  }

  let c = 0
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = j * cols + i
      const pix = ys[j] * width + xs[i]
      if (!valid(d[v])) { dropped.invalid++; continue }
      if (src.mask && !src.mask[pix]) { dropped.masked++; continue }
      if (opt.edgeRing !== 'off') {
        const side = edgeSide(l, cut, i, j)
        if (side === 1 || (side === 2 && opt.edgeRing === 'both')) { dropped.edge++; continue }
      }
      const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2]
      const r = Math.hypot(px, py, pz)
      // w: unit vector from the surface towards the camera
      const wx = -px / r, wy = -py / r, wz = -pz / r
      let nx = wx, ny = wy, nz = wz
      if (tangent(i, j, 1, 0, 0) && tangent(i, j, 0, 1, 3)) {
        nx = tan[1] * tan[5] - tan[2] * tan[4]
        ny = tan[2] * tan[3] - tan[0] * tan[5]
        nz = tan[0] * tan[4] - tan[1] * tan[3]
        const len = Math.hypot(nx, ny, nz)
        if (len > 0) {
          const s = nx * wx + ny * wy + nz * wz < 0 ? -1 / len : 1 / len
          nx *= s; ny *= s; nz *= s
        } else { nx = wx; ny = wy; nz = wz }
      }
      const cos = nx * wx + ny * wy + nz * wz
      // tilt axis: the view direction projected into the surface plane
      let ux = wx - cos * nx, uy = wy - cos * ny, uz = wz - cos * nz
      let ul = Math.hypot(ux, uy, uz)
      if (ul < 1e-6) { ux = nz; uy = 0; uz = -nx; ul = Math.hypot(ux, uz) } // n x (0,1,0) up to sign
      if (ul < 1e-6) { ux = 1; uy = 0; uz = 0; ul = 1 }
      ux /= ul; uy /= ul; uz /= ul
      const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux
      const [su, sv] = splatSigma(d[v], f, cos, stride, opt.maxStretch)
      centers[c * 3] = px; centers[c * 3 + 1] = py; centers[c * 3 + 2] = pz
      scales[c * 3] = su; scales[c * 3 + 1] = sv; scales[c * 3 + 2] = sv * opt.thickness
      quatFromBasis(ux, uy, uz, vx, vy, vz, nx, ny, nz, quaternions, c * 4)
      colors[c * 3] = src.rgba[pix * 4]
      colors[c * 3 + 1] = src.rgba[pix * 4 + 1]
      colors[c * 3 + 2] = src.rgba[pix * 4 + 2]
      opacities[c] = opt.opacity
      pixels[c] = pix
      c++
    }
  }
  return {
    count: c,
    centers: centers.slice(0, c * 3),
    colors: colors.slice(0, c * 3),
    opacities: opacities.slice(0, c),
    scales: scales.slice(0, c * 3),
    quaternions: quaternions.slice(0, c * 4),
    pixels: pixels.slice(0, c),
    dropped,
  }
}
