// How far a camera has left a reference view, in degrees. Pure (plain arrays), unit-tested.
//
// Two things open holes in a projected set: looking somewhere the projector never looked (direction change), and
// seeing the set from a different place (parallax around the subject). The readout is the larger of the two:
//   direction  angle between the two cameras' forward vectors
//   parallax   angle at the pivot (what the camera orbits / looks at) between the two camera positions

export type Vec3 = readonly [number, number, number]

export interface Pose {
  position: Vec3
  /** unit (or any non-zero) forward vector */
  forward: Vec3
}

/** Past this the view is leaving well-covered ground (shown amber). */
export const WARN_DEG = 20

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3) => Math.sqrt(dot(a, a))

/** Angle between two vectors in degrees; 0 when either is degenerate. */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const la = len(a)
  const lb = len(b)
  if (la < 1e-9 || lb < 1e-9) return 0
  const c = Math.min(1, Math.max(-1, dot(a, b) / (la * lb)))
  return (Math.acos(c) * 180) / Math.PI
}

/** Degrees between two camera poses, seen from `pivot` (max of direction change and parallax at the pivot). */
export function poseDeltaDeg(a: Pose, b: Pose, pivot: Vec3): number {
  const direction = angleBetweenDeg(a.forward, b.forward)
  const parallax = angleBetweenDeg(sub(a.position, pivot), sub(b.position, pivot))
  return Math.max(direction, parallax)
}

/** (QA run 5) plain words, not the projector's jargon */
export const angleLabel = (deg: number) => `turned ${Math.round(deg)} degrees away from the camera`
export const isWide = (deg: number) => deg > WARN_DEG
