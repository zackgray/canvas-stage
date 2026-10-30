// Blocking's pure geometry: the top view's ground window and click mapping (copied from Perform's topViewMath and extended with
// extras paths and a hit test that honours preserveAspectRatio), arc lengths for actions placed on path points, and the check
// that a drawn path runs through a kit piece's footprint.
import type { KitItem, ScenePlan } from '../../../../stage3d/contract'
import { pieceOf } from '../../../../stage3d/kit'
import { markOf } from '../../../../stage3d/mark'
import { KIT_MASTER_POSITION } from '../../../../../server/stage3d/master'

export type Pt = [number, number]
export type Box = [number, number, number, number]

/** the ground window shown, metres: [x0, z0, x1, z1] around the pieces, every path and the camera, with a margin */
export function viewBox(plan: ScenePlan, paths: Pt[][]): Box {
  const pts: Pt[] = [...plan.kit.map((k) => k.at), ...paths.flat(), [KIT_MASTER_POSITION[0], KIT_MASTER_POSITION[2]], markOf(plan).at]
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1])
  const pad = 4
  return [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad]
}

/**
 * A click at (px, py) pixels inside an element of size (rw, rh) showing `box` with preserveAspectRatio="xMidYMid meet" -> the
 * ground point, rounded to 5 cm; null when the click falls in the letterbox bars (outside the drawing). Perform's mapping took
 * the element's box as the drawing's, which drifts as soon as the element's aspect differs from the box's.
 */
export function groundPointAt(box: Box, rw: number, rh: number, px: number, py: number): Pt | null {
  const w = box[2] - box[0], h = box[3] - box[1]
  if (!(rw > 0 && rh > 0 && w > 0 && h > 0)) return null
  const k = Math.min(rw / w, rh / h), ox = (rw - w * k) / 2, oy = (rh - h * k) / 2
  const gx = (px - ox) / k, gz = (py - oy) / k
  if (gx < -1e-9 || gz < -1e-9 || gx > w + 1e-9 || gz > h + 1e-9) return null
  const r = (v: number) => Math.round(v * 20) / 20
  return [r(box[0] + gx), r(box[1] + gz)]
}

/** cumulative arc length at each point of a ground polyline */
export function arcs(path: Pt[]): number[] {
  const out: number[] = []
  path.forEach((p, i) => out.push(i ? out[i - 1] + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0))
  return out
}

export const pathLength = (path: Pt[]): number => arcs(path).at(-1) ?? 0

/** the index of the path point whose arc length is `at` (within 5 cm), or -1: how a saved action finds the point it was placed on */
export function pointAtArc(path: Pt[], at: number): number {
  const a = arcs(path)
  let best = -1, d = 0.05
  a.forEach((s, i) => { if (Math.abs(s - at) <= d) { best = i; d = Math.abs(s - at) } })
  return best
}

/** distance from p to the segment ab */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz)
}

/** a body's half-width, metres: a path closer than this plus the piece's own half-width walks into it */
export const BODY_RADIUS = 0.3

/**
 * The kit pieces a path runs through: the piece's footprint (a segment along its local +x, half-width w, as planRules.inCorridor
 * reads it, widened by half its half-width) sampled every 0.5 m, against the path's segments. Pieces marked walkThrough are skipped. Returns their kit indices.
 */
export function footprintHits(kit: KitItem[], path: Pt[]): number[] {
  if (path.length < 2) return []
  const hits: number[] = []
  kit.forEach((it, i) => {
    const piece = pieceOf(it.kind) // own keys only: a kind of 'constructor' or 'toString' is no piece (stage3d m1)
    if (!piece || it.walkThrough) return
    const args = piece.args.map((s, j) => it.args?.[j] ?? s.def), s = it.scale ?? 1
    const [a, b, w] = piece.extent(args), yaw = ((it.yawDeg ?? 0) * Math.PI) / 180, cx = Math.cos(yaw), sx = -Math.sin(yaw)
    const steps = Math.max(1, Math.ceil(((b - a) * s) / 0.5)), r = w * s * 0.5 + BODY_RADIUS
    for (let k = 0; k <= steps; k++) {
      const t = (a + ((b - a) * k) / steps) * s, q: Pt = [it.at[0] + cx * t, it.at[1] + sx * t]
      if (path.some((p, j) => j > 0 && segDist(q, path[j - 1], p) < r)) { hits.push(i); return }
    }
  })
  return hits
}
