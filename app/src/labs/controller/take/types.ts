// A take: the camera sampled at a fixed frame rate while the operator performs a move.
// Plain tuples so takes serialise straight to JSON.

export type Vec3T = [number, number, number]
/** x, y, z, w (three.js order). */
export type QuatT = [number, number, number, number]

export interface CameraSample {
  /** Seconds from the start of the take. */
  t: number
  position: Vec3T
  quaternion: QuatT
  /** mm, 36 mm-wide sensor. */
  focal: number
  /** (retired) a focus distance in metres that older takes carry: new takes do not record it and nothing reads it. */
  focus?: number
}

export interface TakeEvent {
  t: number
  type: 'still'
}

export interface RawTake {
  fps: number
  /** Timeline time when recording started; playback re-runs the car from here. */
  timelineStart: number
  rig: string
  capSeconds: number
  smoothingAmount: number
  samples: CameraSample[]
  events: TakeEvent[]
}

// ---- small tuple maths (kept free of three.js so it is trivially testable) ----

export function qDot(a: QuatT, b: QuatT): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
}

export function qNormalize(q: QuatT): QuatT {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

/** Angle (radians) between two orientations. */
export function qAngle(a: QuatT, b: QuatT): number {
  const d = Math.min(1, Math.abs(qDot(a, b)))
  return 2 * Math.acos(d)
}

export function qSlerp(a: QuatT, b: QuatT, t: number): QuatT {
  let d = qDot(a, b)
  let bb = b
  if (d < 0) {
    d = -d
    bb = [-b[0], -b[1], -b[2], -b[3]]
  }
  if (d > 0.9995) {
    return qNormalize([
      a[0] + (bb[0] - a[0]) * t,
      a[1] + (bb[1] - a[1]) * t,
      a[2] + (bb[2] - a[2]) * t,
      a[3] + (bb[3] - a[3]) * t,
    ])
  }
  const th = Math.acos(d)
  const s = Math.sin(th)
  const wa = Math.sin((1 - t) * th) / s
  const wb = Math.sin(t * th) / s
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb]
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpSample(a: CameraSample, b: CameraSample, t: number, atTime?: number): CameraSample {
  return {
    t: atTime ?? lerp(a.t, b.t, t),
    position: [lerp(a.position[0], b.position[0], t), lerp(a.position[1], b.position[1], t), lerp(a.position[2], b.position[2], t)],
    quaternion: qSlerp(a.quaternion, b.quaternion, t),
    focal: lerp(a.focal, b.focal, t),
    ...(a.focus !== undefined && b.focus !== undefined ? { focus: lerp(a.focus, b.focus, t) } : {}),
  }
}

/** Evaluate a time-sorted track (samples or keyframes) at time t, interpolating linearly / slerp. */
export function evaluateTrack(track: CameraSample[], t: number): CameraSample {
  if (track.length === 0) throw new Error('empty track')
  if (t <= track[0].t) return track[0]
  const last = track[track.length - 1]
  if (t >= last.t) return last
  let lo = 0
  let hi = track.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (track[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = track[lo]
  const b = track[hi]
  return lerpSample(a, b, (t - a.t) / (b.t - a.t), t)
}
