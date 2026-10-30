// World geometry (pure, three-free): tuple vectors, unprojecting planar depth to world points, and a RANSAC plane fit.
// Ported from E24's experiments/lib/e24-geom.ts (the fit that grounded the stage-ready car). Cameras follow three.js:
// looks down -Z, +Y up, quaternion [x, y, z, w], vfov vertical in degrees, pixel centres at x + 0.5.
export type V3 = [number, number, number]
export type Q4 = [number, number, number, number]
export interface Cam { position: V3; quaternion: Q4; vfovDeg: number; width: number; height: number }

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(...a) || 1))
export const len = (a: V3) => Math.hypot(...a)

export function rotate(q: Q4, v: V3): V3 {
  const [x, y, z, w] = q
  const t = mul(cross([x, y, z], v), 2)
  return add(add(v, mul(t, w)), cross([x, y, z], t))
}

/** World point of pixel (px, py) at planar depth d. */
export function unprojectPixel(c: Cam, px: number, py: number, d: number): V3 {
  const th = Math.tan((c.vfovDeg * Math.PI) / 360)
  const asp = c.width / c.height
  const xc = ((2 * (px + 0.5)) / c.width - 1) * th * asp * d
  const yc = (1 - (2 * (py + 0.5)) / c.height) * th * d
  return add(rotate(c.quaternion, [xc, yc, -d]), c.position)
}

/** n·p + d = 0, n unit, pointing up (+Y side). */
export interface Plane { n: V3; d: number }
export const planeDist = (pl: Plane, p: V3) => dot(pl.n, p) + pl.d
/** The point on the plane under (along the normal from) p. */
export const onPlane = (pl: Plane, p: V3): V3 => sub(p, mul(pl.n, planeDist(pl, p)))

/** Where a ray (origin o, direction dir) meets the plane in front of it, else null. */
export function rayPlane(pl: Plane, o: V3, dir: V3): V3 | null {
  const den = dot(pl.n, dir)
  if (Math.abs(den) < 1e-9) return null
  const t = -planeDist(pl, o) / den
  return t > 0 ? add(o, mul(dir, t)) : null
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const up = (n: V3): V3 => (n[1] < 0 ? mul(n, -1) : n)

/** Least-squares plane through points: the covariance's smallest eigenvector (Jacobi on the symmetric 3×3). */
function fitPlane(pts: V3[]): Plane {
  const m = mul(pts.reduce<V3>((c, p) => add(c, p), [0, 0, 0]), 1 / pts.length)
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const p of pts) { const q = sub(p, m); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i][j] += q[i] * q[j] }
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 50; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(A[p][q]) < 1e-15) continue
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q])
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1))
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs
      for (let k = 0; k < 3; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = cs * a - sn * b; A[k][q] = sn * a + cs * b }
      for (let k = 0; k < 3; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = cs * a - sn * b; A[q][k] = sn * a + cs * b }
      for (let k = 0; k < 3; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = cs * a - sn * b; V[k][q] = sn * a + cs * b }
    }
  }
  let i = 0
  for (let k = 1; k < 3; k++) if (A[k][k] < A[i][i]) i = k
  const n = up(norm([V[0][i], V[1][i], V[2][i]]))
  return { n, d: -dot(n, m) }
}

export type PlaneFit = Plane & { inliers: number; samples: number; rmsM: number; tiltDeg: number }

export const tiltDeg = (n: V3) => (Math.acos(Math.min(1, Math.abs(n[1]))) * 180) / Math.PI

/**
 * RANSAC (3-point hypotheses within `thresh` metres), then a least-squares refit on the inliers. Hypotheses tilted
 * more than `maxTiltDeg` from +Y are skipped, so a facade never wins over the street. Deterministic (seeded); null
 * when nothing fits: fewer than `minShare` of the points on the plane, or the refit tilted past the limit.
 */
export function ransacPlane(pts: V3[], thresh = 0.04, maxTiltDeg = 45, minShare = 0.3, iters = 400, seed = 24): PlaneFit | null {
  if (pts.length < 3) return null
  const r = rng(seed)
  let best: Plane | null = null, bestN = 0
  for (let it = 0; it < iters; it++) {
    const a = pts[Math.floor(r() * pts.length)], b = pts[Math.floor(r() * pts.length)], c = pts[Math.floor(r() * pts.length)]
    const nn = cross(sub(b, a), sub(c, a))
    const l = len(nn)
    if (l < 1e-9) continue
    const n = up(mul(nn, 1 / l))
    if (tiltDeg(n) > maxTiltDeg) continue
    const pl = { n, d: -dot(n, a) }
    let k = 0
    for (const p of pts) if (Math.abs(planeDist(pl, p)) < thresh) k++
    if (k > bestN) { bestN = k; best = pl }
  }
  if (!best || bestN < Math.max(3, minShare * pts.length)) return null
  let pl = best
  for (let round = 0; round < 3; round++) {
    const ins = pts.filter((p) => Math.abs(planeDist(pl, p)) < thresh)
    if (ins.length < 3) break
    pl = fitPlane(ins)
  }
  const res = pts.map((p) => planeDist(pl, p)).filter((d) => Math.abs(d) < thresh)
  if (tiltDeg(pl.n) > maxTiltDeg || res.length < minShare * pts.length) return null
  return {
    ...pl, inliers: res.length, samples: pts.length,
    rmsM: Math.sqrt(res.reduce((s, d) => s + d * d, 0) / Math.max(1, res.length)), tiltDeg: tiltDeg(pl.n),
  }
}
