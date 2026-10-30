// Match the Surround's ground to the set's (plan-build-1022 A5, E78): the pano's own depth puts its ground elsewhere than the
// still's (on the 766 battlefield ~0.3 m below the set's ahead and ~1.5 m below it to the sides: a bowl, not a plane, so no
// single plane-to-plane map fixes it). Every far-mesh vertex slides along its own ray from the projector, so the projector's
// view of the surround is unchanged pixel for pixel; what moves is where things are when the camera leaves the centre:
//  - ground (a vertex whose surface faces up, against the surround's fitted floor `surround.floor`) is put ON the set's
//    floor plane, fully out to NEAR camera heights of ground distance and fading to untouched at FAR;
//  - anything standing on it (walking up its pano column from the nadir, still attached) moves with the ground it stands
//    on, so posts and walls keep their feet; outside the still's footprint only: inside it (and fading over FOOT_FADE
//    beyond) objects keep the depth the still-alignment gave them, which is what the set's own edges meet;
//  - past a depth jump (something farther, seen above a near object) the carried move fades with that ray's distance.
// Pure (Float32Array in, Float32Array out).
import { levelBasis, toCam } from '../../../../server/surround/equirect.ts'
import type { SurroundFloor } from '../../../shared/worldContract.ts'

type V3 = readonly [number, number, number]

/** a floor plane in projector camera space: unit `up`, camera `h` above it (app units, before the root scale) */
export interface FloorPlane { up: V3; h: number }
/** the still's frustum in projector camera space (half-angle tangents), where objects keep their alignment */
export interface Footprint { tx: number; ty: number }

/** ground distance (in camera heights) out to which the match is full: 6 × 1.6 m ≈ 9.6 m at eye height */
export const GROUND_NEAR = 6
/** ground distance (camera heights) where the match has faded out */
export const GROUND_FAR = 15
/** a surface within this of facing up (against the surround floor's up) is ground: MoGe's pano mud is lumpy, so loose */
const GROUND_COS = Math.cos((45 * Math.PI) / 180)
/** a step to farther than this ratio up a column ends what the previous vertex stood on */
const DETACH = 1.25
/** grid vertices either side for the surface normal (4 texels each on the 2048 grid): ground if either stencil faces up */
const K = [1, 2]
/** how far past the footprint's edge (in tangent units) objects blend to moving with their ground */
const FOOT_FADE = 0.25
/** below this sine of depression a ray never meets the plane in range */
const GRAZE = 1e-3

/** The surround's floor in projector camera space: `floor.up` is in the surround's level frame (`meta.up`). */
export function surroundFloorPlane(floor: SurroundFloor, metaUp: V3): FloorPlane {
  const up = toCam(levelBasis([metaUp[0], metaUp[1], metaUp[2]]), [...floor.up])
  const n = Math.hypot(up[0], up[1], up[2])
  return { up: [up[0] / n, up[1] / n, up[2] / n], h: floor.heightM }
}

/** 1 out to NEAR camera heights of ground distance, 0 past FAR (smoothstep between); 0 at or above the horizon. */
export function reachWeight(dir: V3, set: FloorPlane): number {
  const ds = -(set.up[0] * dir[0] + set.up[1] * dir[1] + set.up[2] * dir[2])
  if (ds <= GRAZE) return 0
  const reach = Math.sqrt(Math.max(0, 1 - ds * ds)) / ds
  if (reach <= GROUND_NEAR) return 1
  if (reach >= GROUND_FAR) return 0
  const t = (reach - GROUND_NEAR) / (GROUND_FAR - GROUND_NEAR)
  return 1 - t * t * (3 - 2 * t)
}

/** 1 inside the still's frustum, fading to 0 FOOT_FADE outside it, 0 behind. */
export function footprintWeight(dir: V3, f: Footprint | null): number {
  if (!f || dir[2] >= 0) return 0
  const ex = Math.max(0, Math.abs(dir[0] / -dir[2]) / f.tx - 1), ey = Math.max(0, Math.abs(dir[1] / -dir[2]) / f.ty - 1)
  const e = Math.max(ex, ey)
  return e >= FOOT_FADE ? 0 : 1 - e / FOOT_FADE
}

/**
 * Far-mesh positions (row-major `rows` × `cols` grid of xyz, projector camera space; distance 0 = sky) with the ground
 * matched to `set`. `surUp` is the surround's floor normal (camera space) the ground test faces against. A new array.
 */
export function matchGround(position: Float32Array, cols: number, rows: number, set: FloorPlane, surUp: V3, foot: Footprint | null = null): Float32Array {
  const out = new Float32Array(position.length)
  const at = (r: number, c: number) => ((r * cols + (((c % (cols - 1)) + cols - 1) % (cols - 1))) * 3)
  const len = (i: number) => Math.hypot(position[i], position[i + 1], position[i + 2])
  const facesUp = (r: number, c: number) => K.some((k) => facesUpAt(r, c, k))
  const facesUpAt = (r: number, c: number, k: number) => {
    if (r - k < 0 || r + k >= rows) return false
    const a = at(r - k, c), b = at(r + k, c), l = at(r, c - k), q = at(r, c + k)
    if (!len(a) || !len(b) || !len(l) || !len(q)) return false
    const v = [position[a] - position[b], position[a + 1] - position[b + 1], position[a + 2] - position[b + 2]]
    const h = [position[q] - position[l], position[q + 1] - position[l + 1], position[q + 2] - position[l + 2]]
    const n = [v[1] * h[2] - v[2] * h[1], v[2] * h[0] - v[0] * h[2], v[0] * h[1] - v[1] * h[0]]
    const m = Math.hypot(n[0], n[1], n[2])
    return m > 0 && Math.abs(n[0] * surUp[0] + n[1] * surUp[1] + n[2] * surUp[2]) / m > GROUND_COS
  }
  for (let c = 0; c < cols; c++) {
    let carry = 1
    let prev = 0
    for (let r = rows - 1; r >= 0; r--) {
      const i = (r * cols + c) * 3
      const t = len(i)
      if (!t) { carry = 1; prev = 0; continue }
      const dir: V3 = [position[i] / t, position[i + 1] / t, position[i + 2] / t]
      const ds = -(set.up[0] * dir[0] + set.up[1] * dir[1] + set.up[2] * dir[2])
      const w = reachWeight(dir, set)
      let f: number
      if (ds > GRAZE && facesUp(r, c)) {
        f = carry = 1 + w * (set.h / ds / t - 1)
      } else {
        if (prev && t > prev * DETACH) carry = 1 + w * (carry - 1)
        f = 1 + (1 - footprintWeight(dir, foot)) * (carry - 1)
      }
      out[i] = position[i] * f
      out[i + 1] = position[i + 1] * f
      out[i + 2] = position[i + 2] * f
      prev = t
    }
  }
  return out
}
