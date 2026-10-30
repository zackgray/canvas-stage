/**
 * MoGe-2 depth -> metres. Pure (no fs), shared by experiments/e2-process.ts, e3_process.ts and the settle endpoint.
 *
 * MoGe's own depth render is normalised INVERSE depth: it fits 1/z = a*e + b with R^2 = 1.0000 against MoGe's
 * metric point-map GLB (see experiments/e2-depth.md). So metric depth = 1 / (a*e + b), with a, b fitted per image
 * from the GLB vertices (position z, uv -> pixel of the normalised render). The same pass estimates the vertical
 * FOV MoGe used, from vertices away from the image's centre row.
 */

export interface MogeRender {
  width: number
  height: number
  /** normalised inverse depth, top row first */
  values: Float32Array
}

export interface InverseFit {
  a: number
  b: number
  /** R^2 of the 1/z fit (1.0000 when the render really is affine in inverse depth) */
  r2: number
  /** vertical FOV implied by the point map, degrees */
  vfovDeg: number
}

/** Least-squares 1/z = a*e + b over point-map vertices. `positions` xyz (camera looks down -z), `uvs` per vertex. */
export function fitInverse(positions: Float32Array, uvs: Float32Array, e: MogeRender): InverseFit {
  const { width: W, height: H } = e
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0
  const fy: number[] = []
  for (let i = 0; i < positions.length / 3; i++) {
    const px = uvs[2 * i] * W - 0.5, py = uvs[2 * i + 1] * H - 0.5
    const z = -positions[3 * i + 2]
    const v = e.values[Math.round(Math.min(H - 1, Math.max(0, py))) * W + Math.round(Math.min(W - 1, Math.max(0, px)))]
    if (!(z > 0) || !Number.isFinite(v)) continue
    const y = 1 / z
    n++; sx += v; sy += y; sxx += v * v; sxy += v * y; syy += y * y
    if (Math.abs(py - H / 2) > Math.min(150, H / 5)) fy.push((-(py - H / 2) * z) / positions[3 * i + 1])
  }
  if (n < 2) throw new Error('MoGe point map has no usable vertices')
  const cov = sxy / n - (sx / n) * (sy / n), vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2
  const a = cov / vx, b = sy / n - a * (sx / n)
  fy.sort((p, q) => p - q)
  const f = fy[fy.length >> 1]
  return { a, b, r2: (cov * cov) / (vx * vy), vfovDeg: (2 * Math.atan(H / 2 / f) * 180) / Math.PI }
}

/** Metric planar depth from the render; NaN where `valid` (0..1 per pixel, MoGe's mask) is below 0.5. */
export function mogeMetres(e: MogeRender, fit: Pick<InverseFit, 'a' | 'b'>, valid?: ArrayLike<number>): Float32Array {
  const z = new Float32Array(e.values.length)
  for (let i = 0; i < z.length; i++) {
    const d = 1 / (fit.a * e.values[i] + fit.b)
    z[i] = (valid && valid[i] < 0.5) || !(d > 0) || !Number.isFinite(d) ? NaN : d
  }
  return z
}

/** Quantise metres to the 16-bit linear near-dark format (0 = invalid); max finite depth maps to 65535. */
export function quantiseMetres(z: Float32Array): { values: Uint16Array; metersPerUnit: number } {
  let max = 0
  for (const v of z) if (Number.isFinite(v) && v > max) max = v
  const mpu = max > 0 ? max / 65535 : 1
  const values = new Uint16Array(z.length)
  for (let i = 0; i < z.length; i++) values[i] = Number.isFinite(z[i]) && z[i] > 0 ? Math.max(1, Math.round(z[i] / mpu)) : 0
  return { values, metersPerUnit: mpu }
}
