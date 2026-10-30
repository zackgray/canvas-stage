// The set's ground (pure): the street plane fitted to the projected set's own points, as E24b grounded its car.
// Global fit: RANSAC over the points seen in the bottom of the projector's frame (where the street is). Local refit:
// RANSAC again, tighter, over the set's points near the car's path, seeded by the global plane.
import {
  add, dot, mul, norm, planeDist, ransacPlane, rotate, sub, unprojectPixel, type Cam, type Plane, type PlaneFit, type Q4, type V3,
} from './geom'

export interface DepthView {
  /** planar depth from the camera, row-major, top row first; 0 / non-finite = no geometry */
  depth: Float32Array
  /** the camera the depth was seen from, at the depth map's own size */
  cam: Cam
}

/** Bottom part of the frame the global fit reads, and the sample budget. */
const BOTTOM = 0.45
const MAX_POINTS = 6000

/** World points of the set under pixels in rows [y0, y1), on a stride that keeps about `budget` samples. */
export function setPoints(v: DepthView, y0: number, y1: number, budget = MAX_POINTS): V3[] {
  const { width: W } = v.cam
  const rows = Math.max(1, y1 - y0)
  const stride = Math.max(1, Math.round(Math.sqrt((W * rows) / budget)))
  const out: V3[] = []
  for (let y = y0; y < y1; y += stride) for (let x = 0; x < W; x += stride) {
    const d = v.depth[y * W + x]
    if (d > 0 && Number.isFinite(d)) out.push(unprojectPixel(v.cam, x, y, d))
  }
  return out
}

/** The street: a plane through the set's points in the bottom of the frame. Null when nothing plane-like is there. */
export function fitGround(v: DepthView, thresh = 0.04): PlaneFit | null {
  const H = v.cam.height
  return ransacPlane(setPoints(v, Math.floor(H * (1 - BOTTOM)), H), thresh)
}

/** Squared distance in the plane's plan view from p to the segment a-b (both measured along the plane). */
function planDist2(pl: Plane, p: V3, a: V3, b: V3): number {
  const flat = (q: V3) => sub(q, mul(pl.n, planeDist(pl, q)))
  const pa = flat(p), aa = flat(a), bb = flat(b)
  const ab = sub(bb, aa)
  const L = dot(ab, ab)
  const t = L > 0 ? Math.min(1, Math.max(0, dot(sub(pa, aa), ab) / L)) : 0
  const q = sub(pa, add(aa, mul(ab, t)))
  return dot(q, q)
}

/**
 * Refit the street locally (E24b): the set's points within 15 cm of the global plane and `margin` metres of the
 * path a-b in plan, RANSAC at 2 cm. Null when too few points are there (the path runs off the set): keep the global.
 */
export function refitAlong(v: DepthView, global: Plane, a: V3, b: V3, margin = 2): PlaneFit | null {
  const m2 = margin * margin
  const pts = setPoints(v, 0, v.cam.height, MAX_POINTS * 2)
    .filter((p) => Math.abs(planeDist(global, p)) < 0.15 && planDist2(global, p, a, b) < m2)
  if (pts.length < 40) return null
  return ransacPlane(pts, 0.02)
}

/**
 * World direction TOWARD the sun (E24b's estimate for the low street): `elevDeg` above the plane, from camera-left,
 * turned `towardCamDeg` from the camera's left toward the camera. A per-set sun estimate replaces the defaults later.
 */
export function sunDirection(q: Q4, upN: V3, elevDeg = 22, towardCamDeg = 35): V3 {
  const inPlane = (v: V3) => norm(sub(v, mul(upN, dot(v, upN))))
  const right = inPlane(rotate(q, [1, 0, 0]))
  const toCam = inPlane(rotate(q, [0, 0, 1]))
  const e = (elevDeg * Math.PI) / 180, az = (towardCamDeg * Math.PI) / 180
  const horiz = add(mul(right, -Math.cos(az)), mul(toCam, Math.sin(az)))
  return norm(add(mul(upN, Math.sin(e)), mul(horiz, Math.cos(e))))
}
