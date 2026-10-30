/**
 * Is a still taken at the take's start pose? The clip's first frame is that still, so its camera (the export's
 * meta.json `camera`, written by the lab's Export view) must sit where the guide's frame 0 sits, looking the same way
 * through the same lens. Pure, browser-safe: the lab refuses before posting, the endpoint again before spending.
 *
 * Tolerances: 5 cm, 1°, 0.5° of vertical fov. "Go to take start" puts the camera exactly on the pose (the operator then
 * holds it still), so a still taken there matches to well under these; a still from anywhere else (a few steps away,
 * a small pan, a zoom) fails.
 */

export interface PoseLike {
  position: number[]
  quaternion: number[]
  /** vertical fov in degrees, as the lab's export camera has it */
  vfovDeg: number
}

export const POSE_TOLERANCE = { position: 0.05, angleDeg: 1, vfovDeg: 0.5 } as const

export interface PoseGap {
  position: number
  angleDeg: number
  vfovDeg: number
}

const finite = (xs: unknown, n: number): xs is number[] => Array.isArray(xs) && xs.length === n && xs.every((x) => typeof x === 'number' && Number.isFinite(x))

/** Distances between two camera poses (angle between orientations, q and -q alike). */
export function poseGap(a: PoseLike, b: PoseLike): PoseGap {
  const p = a.position.map((v, i) => v - b.position[i])
  const la = Math.hypot(...a.quaternion) || 1
  const lb = Math.hypot(...b.quaternion) || 1
  const dot = Math.abs(a.quaternion.reduce((s, v, i) => s + v * b.quaternion[i], 0)) / (la * lb)
  return { position: Math.hypot(...p), angleDeg: (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI, vfovDeg: Math.abs(a.vfovDeg - b.vfovDeg) }
}

/** null when the still's camera is at the take's start pose, else the reason (user-facing). */
export function poseMismatch(still: unknown, start: PoseLike): string | null {
  const s = still as Partial<PoseLike> | null | undefined
  if (!s || !finite(s.position, 3) || !finite(s.quaternion, 4) || typeof s.vfovDeg !== 'number') {
    return 'That still has no camera on record (an older export): take a new still at the take\'s start.'
  }
  const g = poseGap(s as PoseLike, start)
  const t = POSE_TOLERANCE
  const off: string[] = []
  if (g.position > t.position) off.push(`${(g.position * 100).toFixed(0)} cm away`)
  if (g.angleDeg > t.angleDeg) off.push(`turned ${g.angleDeg.toFixed(1)}°`)
  if (g.vfovDeg > t.vfovDeg) off.push(`lens differs by ${g.vfovDeg.toFixed(1)}° of fov`)
  if (!off.length) return null
  return `That still was not taken at the take's start (${off.join(', ')}; allowed ${t.position * 100} cm, ${t.angleDeg}°, ${t.vfovDeg}° fov). ` +
    'Press Go to take start, take a still there, then pick it.'
}

/**
 * The world at a moment (O-02): the world clock's time and a hash of what drives the moving objects (the car's path,
 * speed and end behaviour; NO_WORLD when nothing moves). A still's export meta.json carries it as `world`, a take
 * records it, and a guide's cameras.json carries the take's as `worldStart` (the world at guide frame 0). The camera
 * check alone cannot tell a still with the car mid-street from one at the take's start, or one taken after a path edit.
 */
export interface WorldStamp {
  time: number
  trackHash: string
}

export const NO_WORLD = 'none'
/** one frame at the clip's 24 fps */
export const WORLD_TIME_TOLERANCE = 1 / 24

/** null when the still's world matches the take's start, else the reason (user-facing). */
export function worldMismatch(still: unknown, start: WorldStamp | null | undefined): string | null {
  if (!start || typeof start.trackHash !== 'string' || typeof start.time !== 'number' || !Number.isFinite(start.time)) {
    return 'That guide has no world time on record (an older export): export the guide again.'
  }
  const s = still as Partial<WorldStamp> | null | undefined
  if (!s || typeof s.trackHash !== 'string' || typeof s.time !== 'number' || !Number.isFinite(s.time)) {
    return 'That still has no world time on record (an older export): press Go to take start, take a new still there, then pick it.'
  }
  if (s.trackHash !== start.trackHash) {
    return start.trackHash === NO_WORLD ? 'That still was taken with a car in the set; the take had nothing moving. Remove the car or record the take again.'
      : s.trackHash === NO_WORLD ? 'That still was taken with no car in the set; the take had one. Put it back or record the take again.'
      : 'The car\'s path, speed or end changed since the take: that still shows a different world from the guide. Put it back or record the take again.'
  }
  if (start.trackHash === NO_WORLD) return null // nothing moves: the clock shows nothing
  if (Math.abs(s.time - start.time) <= WORLD_TIME_TOLERANCE + 1e-6) return null
  return `That still was taken at world time ${s.time.toFixed(2)} s; the take starts at ${start.time.toFixed(2)} s (the car is elsewhere). ` +
    'Press Go to take start, take a still there without playing the timeline, then pick it.'
}

/** Both checks on a still's export meta.json (its `camera` and `world`): null = usable as the take's first frame. */
export function firstFrameMismatch(meta: unknown, start: PoseLike, world: WorldStamp | null | undefined): string | null {
  const m = meta as { camera?: unknown; world?: unknown } | null | undefined
  return poseMismatch(m?.camera, start) ?? worldMismatch(m?.world, world)
}
