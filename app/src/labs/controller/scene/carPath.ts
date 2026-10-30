// The getaway car's path (a spline along the street) and its speed curve on the timeline.
// Pure: given a timeline time, where is the car, which way is it facing, how fast is it going.
import { CatmullRomCurve3, Vector3 } from 'three'

export const TIMELINE_DURATION = 10
/** Car waits at the kerb, then pulls away. */
const DEPART_AT = 1.0
/** Seconds to reach cruising speed. */
const ACCEL_TIME = 3.0

export const CAR_PATH = new CatmullRomCurve3(
  [
    new Vector3(-30, 0, 3.2),
    new Vector3(-24, 0, 1.6),
    new Vector3(-8, 0, 1.6),
    new Vector3(10, 0, 1.6),
    new Vector3(20, 0, 0.5),
    new Vector3(25, 0, -6),
    new Vector3(26.5, 0, -18),
    new Vector3(27, 0, -32),
  ],
  false,
  'centripetal',
)

const PATH_LENGTH = CAR_PATH.getLength()
const CRUISE_SPEED = PATH_LENGTH / (ACCEL_TIME / 2 + (TIMELINE_DURATION - DEPART_AT - ACCEL_TIME))

export interface CarState {
  position: Vector3
  /** Yaw in radians, three.js convention (0 = facing +Z... rotation about +Y). */
  heading: number
  speed: number
  /** Distance travelled along the path, metres. */
  distance: number
}

/** Distance along the path at timeline time t: wait, accelerate linearly, cruise. */
export function carDistanceAt(t: number): number {
  const tt = Math.min(Math.max(t - DEPART_AT, 0), TIMELINE_DURATION - DEPART_AT)
  const s =
    tt < ACCEL_TIME
      ? (0.5 * CRUISE_SPEED * tt * tt) / ACCEL_TIME
      : CRUISE_SPEED * (ACCEL_TIME / 2 + (tt - ACCEL_TIME))
  return Math.min(s, PATH_LENGTH)
}

export function carSpeedAt(t: number): number {
  const tt = t - DEPART_AT
  if (tt <= 0 || t >= TIMELINE_DURATION) return 0
  return tt < ACCEL_TIME ? (CRUISE_SPEED * tt) / ACCEL_TIME : CRUISE_SPEED
}

export function carStateAt(t: number, out?: CarState): CarState {
  const distance = carDistanceAt(t)
  const u = Math.min(1, distance / PATH_LENGTH)
  const position = CAR_PATH.getPointAt(u, out?.position ?? new Vector3())
  const tangent = CAR_PATH.getTangentAt(u)
  const heading = Math.atan2(tangent.x, tangent.z)
  const speed = carSpeedAt(t)
  if (out) {
    out.heading = heading
    out.speed = speed
    out.distance = distance
    return out
  }
  return { position, heading, speed, distance }
}

export const CAR_SIZE = { length: 4.6, width: 1.9, height: 1.4 }
/** Where an operator frames the car: roughly its centre of mass. */
export const CAR_AIM_HEIGHT = 0.8
