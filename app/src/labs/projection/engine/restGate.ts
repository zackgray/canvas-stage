// When has the view camera moved? Pure (plain arrays), unit-tested; MotionWatch runs it once per frame.
//
// The view is compared with an anchor (where it was at the last reported move) under tolerances in metres and
// degrees, so a spring tail or stick/gyro noise inside the tolerance reads as rest while drift that adds up still
// counts. A lens change is motion too: a zoom reframes the view. A host can also report that something is driving
// the camera right now (operator input, a take playing), which counts as motion however slow.

export type Vec3 = readonly [number, number, number]
export type Quat = readonly [number, number, number, number]

export interface ViewSample {
  position: Vec3
  quaternion: Quat
  /** vertical fov, degrees */
  fov: number
}

export interface RestTolerance {
  metres: number
  degrees: number
  fovDegrees: number
}

/** ~5 mm and 0.1° (a few pixels across a 40° frame): far below what a fill or the angle readout cares about. */
export const REST_TOLERANCE: RestTolerance = { metres: 0.005, degrees: 0.1, fovDegrees: 0.1 }

/** Rotation between two unit quaternions, degrees. */
export function quatDeltaDeg(a: Quat, b: Quat): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI
}

export class RestGate {
  private anchor: ViewSample | null = null
  private tol: RestTolerance

  constructor(tol: RestTolerance = REST_TOLERANCE) {
    this.tol = tol
  }

  /** True when the view left the anchor (which then moves here) or `active`; the first sample always counts. */
  moved(s: ViewSample, active = false): boolean {
    const a = this.anchor
    const left = !a
      || Math.hypot(s.position[0] - a.position[0], s.position[1] - a.position[1], s.position[2] - a.position[2]) > this.tol.metres
      || quatDeltaDeg(a.quaternion, s.quaternion) > this.tol.degrees
      || Math.abs(s.fov - a.fov) > this.tol.fovDegrees
      || !(Number.isFinite(s.fov) && Number.isFinite(s.position[0]))
    if (!left && !active) return false
    this.anchor = { position: [...s.position], quaternion: [...s.quaternion], fov: s.fov }
    return true
  }
}
