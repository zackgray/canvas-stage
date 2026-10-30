// Where a dragged piece goes under the pointer in a 3D view of the set (the Set's own panes and the merged Stage's lab
// viewport alike). The spot the pointer grabbed on the piece (a tree's crown, a crate's lid) stays under the pointer: the
// pointer's ray is followed to the grabbed spot's level, and the piece moves by as much as the spot did. (Measuring the
// move on the ground under the ray instead overshoots by the ratio of the ground's distance to the grabbed spot's, many
// times over for a crown seen against a far ground, and finds nothing for a spot above the eye.)
// As the piece rides the terrain the spot rises and falls with it, so its level does too: the first point along the ray at
// the spot's level for where the piece would then stand (marched, then halved: a grazing ray over a slope has no stable
// fixed point to iterate to). A ray that never meets that level within the set's reach holds the piece where it was.
import type { Ray, Vector3 } from 'three'
import { LIMITS } from './planRules'

type Pt = [number, number]
export interface Grab {
  /** the grabbed spot on the piece, in the world */
  spot: Vector3
  /** where the piece stood when it was grabbed */
  start: Pt
}

/** a ray meets the grabbed spot's level at most this far from the eye before it counts as a miss (metres) */
export const DRAG_REACH = 200
const STEP = 0.25
const cm = (v: number) => Math.round(v * 100) / 100 + 0 // never -0

/** where the piece stands with the grabbed spot under this ray, or null (hold it where it was) */
export function dragTo(ray: Ray, g: Grab, groundAt: (x: number, z: number) => number): Pt | null {
  const base = groundAt(g.start[0], g.start[1]), o = ray.origin, d = ray.direction
  const atOf = (t: number): Pt => [g.start[0] + o.x + d.x * t - g.spot.x, g.start[1] + o.z + d.z * t - g.spot.z]
  // the ray's height above (+) or below (-) the spot's level, were the piece put where the ray is at t
  const gap = (t: number) => { const a = atOf(t); return o.y + d.y * t - g.spot.y - (groundAt(a[0], a[1]) - base) }
  const s0 = Math.sign(gap(0))
  if (s0 === 0) return inside(atOf(0))
  let lo = 0, hi = -1
  for (let t = STEP; t <= DRAG_REACH; t += STEP) { if (Math.sign(gap(t)) !== s0) { hi = t; break } lo = t }
  if (hi < 0) return null
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (Math.sign(gap(m)) === s0) lo = m; else hi = m }
  return inside(atOf((lo + hi) / 2))
}

/** a place inside the set's bounds, to the centimetre; out past them, null */
function inside(at: Pt): Pt | null {
  const A = LIMITS.at
  return Math.abs(at[0]) > A || Math.abs(at[1]) > A ? null : [cm(at[0]), cm(at[1])]
}
