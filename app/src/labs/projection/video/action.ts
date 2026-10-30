// Action facts from a take's world track (DESIGN.md "Motion description -> video prompt"): what each object in the
// world did in frame, computed from its samples and the camera's, never guessed. World units are metres; three.js
// axes (-Z forward, +Y up). The frame is the clip's (768x448, 36 mm-wide sensor). Plain data out; actionPrompt.ts
// writes the words.
//
// Clock: an object sample's t is seconds on the same clock as the camera samples (the take's, from its first frame).
// The camera samples bound the window: an object is read only between the first and the last camera sample.
import { Quaternion, Vector3 } from 'three'
import type { CameraSample, Vec3T } from '../../controller/take/types'
import { hfovFromFocal } from '../../controller/math/lens'
import { GUIDE_H, GUIDE_W } from '../../../../server/clip/spec.ts'

// ---- the world track (exported with each take and guide folder) ----

export interface WorldObjectSample {
  t: number
  position: Vec3T
  /** radians */
  heading: number
  /** m/s */
  speed: number
  /** Fraction of the object inside the camera frustum this frame, 0..1. */
  visibleFraction?: number
}

export interface WorldObject {
  id: string
  kind: 'car'
  /** The noun phrase the prompt uses, e.g. "a red coupe" (the label the world gives the object). */
  label: string
  samples: WorldObjectSample[]
}

export interface WorldTrack {
  objects: WorldObject[]
}

// ---- the facts ----

export type FrameSide = 'left' | 'right' | 'top' | 'bottom' | 'depth'
export type ActionDirection = 'left-to-right' | 'right-to-left' | 'toward' | 'away'
export type ActionSpeed = 'crawls' | 'moves slowly' | 'moves' | 'moves quickly'
export type ActionPacing = 'steady' | 'accelerating' | 'decelerating'

export interface ObjectAction {
  id: string
  kind: WorldObject['kind']
  label: string
  /** In frame at some point in the window. */
  visible: boolean
  inFrameAtStart: boolean
  /** Moves at all in the window (MOVING); a parked object gets no action sentence. */
  moving: boolean
  /** In frame at the start and below STOP_SPEED there: it pulls away rather than driving through. */
  startsAtRest: boolean
  /** First time it comes into frame, and across which edge ('depth': its centre was already on screen). */
  enter: { t: number; side: FrameSide } | null
  /** First time it leaves frame after being in it. */
  exit: { t: number; side: FrameSide } | null
  /** Comes to rest and stays there: where, in frame thirds, and the landmark if one was given. */
  stop: { t: number; inFrame: boolean; place: 'left' | 'centre' | 'right'; landmark: string | null } | null
  /** Net travel while moving, against the first frame's level camera axes (lateral) and the camera (distance). */
  direction: ActionDirection | null
  /** Mean speed over the moving samples, m/s, and in words (SPEED). */
  meanSpeed: number
  speed: ActionSpeed | null
  pacing: ActionPacing
}

export interface ActionFacts {
  duration: number
  fps: number
  /** Every object in the track, in track order. */
  objects: ObjectAction[]
}

/** In frame: visibleFraction >= 0.5 if the track gives it, else the centre on screen, in front, within 60 m. */
export const IN_FRAME = { visibleFraction: 0.5, farMetres: 60 }
/** The edge an object crosses: its centre past 0.8 of the half-frame (NDC) on that axis; nearer the middle it came from depth. */
export const EDGE_NDC = 0.8
/** Moving: at least 0.5 m travelled and 0.5 m/s reached in the window. At rest: below 0.3 m/s. */
export const MOVING = { metres: 0.5, speed: 0.5 }
export const STOP_SPEED = 0.3
/** Speed words from mean m/s: crawls < 1.5 (walking pace) <= moves slowly < 4 (~15 km/h) <= moves < 12 (~43 km/h) <= moves quickly. */
export const SPEED = { crawl: 1.5, slow: 4, drive: 12 }
/** Pacing: the last third of the moving samples 40 % faster than the first accelerates; under 70 % decelerates. */
export const PACING = { accelerate: 1.4, decelerate: 0.7 }
/** Stop place in frame thirds: |NDC x| under a third is centre-frame. */
export const CENTRE_NDC = 1 / 3

const ASPECT = GUIDE_W / GUIDE_H
const _q = new Quaternion()
const _v = new Vector3()

interface Seen {
  t: number
  position: Vec3T
  speed: number
  /** NDC on the clip frame; z < 0 in front of the camera. */
  x: number
  y: number
  front: boolean
  distance: number
  inFrame: boolean
}

function at(samples: WorldObjectSample[], t: number): WorldObjectSample {
  if (t <= samples[0].t) return samples[0]
  const last = samples[samples.length - 1]
  if (t >= last.t) return last
  let i = 1
  while (samples[i].t < t) i++
  const a = samples[i - 1]
  const b = samples[i]
  const u = (t - a.t) / (b.t - a.t || 1)
  const mix = (p: number, q: number) => p + (q - p) * u
  return {
    t,
    position: [mix(a.position[0], b.position[0]), mix(a.position[1], b.position[1]), mix(a.position[2], b.position[2])],
    heading: mix(a.heading, b.heading),
    speed: mix(a.speed, b.speed),
    visibleFraction: a.visibleFraction === undefined || b.visibleFraction === undefined ? undefined : mix(a.visibleFraction, b.visibleFraction),
  }
}

function see(cam: CameraSample, o: WorldObjectSample): Seen {
  const p = o.position
  _v.set(p[0] - cam.position[0], p[1] - cam.position[1], p[2] - cam.position[2])
  const distance = _v.length()
  _v.applyQuaternion(_q.fromArray(cam.quaternion).invert())
  const front = _v.z < 0
  const tx = Math.tan(hfovFromFocal(cam.focal) / 2)
  const depth = Math.max(-_v.z, 1e-6)
  // Behind the camera: push the centre far off the side it is on.
  const x = front ? _v.x / depth / tx : Math.sign(_v.x || 1) * 1e3
  const y = front ? _v.y / depth / (tx / ASPECT) : 0
  const onScreen = front && Math.abs(x) <= 1 && Math.abs(y) <= 1 && distance <= IN_FRAME.farMetres
  const inFrame = o.visibleFraction === undefined ? onScreen : o.visibleFraction >= IN_FRAME.visibleFraction
  return { t: o.t, position: p, speed: o.speed, x, y, front, distance, inFrame }
}

/** The edge an out-of-frame sample lies past, or 'depth' if its centre is on screen (too far, or not yet visible). */
function sideOf(s: Seen): FrameSide {
  if (!s.front) return s.x < 0 ? 'left' : 'right'
  const ax = Math.abs(s.x)
  const ay = Math.abs(s.y)
  if (Math.max(ax, ay) < EDGE_NDC) return 'depth'
  if (ax >= ay) return s.x < 0 ? 'left' : 'right'
  return s.y > 0 ? 'top' : 'bottom'
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

function speedWord(v: number): ActionSpeed {
  return v < SPEED.crawl ? 'crawls' : v < SPEED.slow ? 'moves slowly' : v < SPEED.drive ? 'moves' : 'moves quickly'
}

function describeObject(o: WorldObject, cams: CameraSample[], landmark: string | null): ObjectAction {
  const seen = cams.map((c) => see(c, at(o.samples, c.t)))
  const n = seen.length
  let travelled = 0
  for (let i = 1; i < n; i++) {
    const a = seen[i - 1].position
    const b = seen[i].position
    travelled += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  }
  const peak = Math.max(...seen.map((s) => s.speed))
  const moving = travelled >= MOVING.metres && peak >= MOVING.speed
  const visible = seen.some((s) => s.inFrame)
  const inFrameAtStart = seen[0].inFrame

  // Frame transitions: the first entry, then the first exit after the object has been in frame.
  let enter: ObjectAction['enter'] = null
  let exit: ObjectAction['exit'] = null
  let wasIn = inFrameAtStart
  for (let i = 1; i < n; i++) {
    const s = seen[i]
    if (!wasIn && s.inFrame && !enter && !exit) enter = { t: s.t, side: sideOf(seen[i - 1]) }
    if (wasIn && !s.inFrame && !exit) exit = { t: s.t, side: sideOf(s) }
    wasIn = s.inFrame
  }

  // At rest from some sample to the end, having moved before it.
  let stop: ObjectAction['stop'] = null
  let k = n
  while (k > 0 && seen[k - 1].speed < STOP_SPEED) k--
  if (moving && k > 0 && k < n) {
    const s = seen[k]
    const place = Math.abs(s.x) < CENTRE_NDC ? 'centre' : s.x < 0 ? 'left' : 'right'
    stop = { t: s.t, inFrame: s.inFrame, place, landmark: s.inFrame ? landmark : null }
  }

  const going = seen.filter((s) => s.speed >= STOP_SPEED)
  const meanSpeed = mean(going.map((s) => s.speed))
  let pacing: ActionPacing = 'steady'
  if (going.length >= 3) {
    const third = Math.max(1, Math.floor(going.length / 3))
    const v1 = mean(going.slice(0, third).map((s) => s.speed))
    const v3 = mean(going.slice(-third).map((s) => s.speed))
    if (v3 > PACING.accelerate * v1) pacing = 'accelerating'
    else if (v3 < PACING.decelerate * v1) pacing = 'decelerating'
  }

  // Direction: lateral travel in the first frame's level axes against the change in distance from the camera.
  let direction: ActionDirection | null = null
  if (moving) {
    const a = going[0] ?? seen[0]
    const b = going[going.length - 1] ?? seen[n - 1]
    _v.set(0, 0, -1).applyQuaternion(_q.fromArray(cams[0].quaternion))
    const yaw = Math.atan2(-_v.x, -_v.z)
    const dx = b.position[0] - a.position[0]
    const dz = b.position[2] - a.position[2]
    const lateral = Math.cos(yaw) * dx - Math.sin(yaw) * dz
    const closer = a.distance - b.distance
    direction = Math.abs(lateral) >= Math.abs(closer)
      ? (lateral >= 0 ? 'left-to-right' : 'right-to-left')
      : (closer > 0 ? 'toward' : 'away')
  }

  return {
    id: o.id, kind: o.kind, label: o.label, visible, inFrameAtStart, moving,
    startsAtRest: moving && inFrameAtStart && seen[0].speed < STOP_SPEED,
    enter, exit, stop, direction, meanSpeed, speed: moving ? speedWord(meanSpeed) : null, pacing,
  }
}

/**
 * What each object in the world track does in the clip's frame, over the camera samples' window. `landmark` names
 * where a stop in frame happens ("in front of the bank steps"); without one the stop is placed in frame thirds.
 */
export function describeAction(world: WorldTrack, cameraSamples: CameraSample[], fps: number, opts: { landmark?: string } = {}): ActionFacts {
  const n = cameraSamples.length
  const duration = n > 1 ? cameraSamples[n - 1].t - cameraSamples[0].t : 0
  const objects = n === 0 ? [] : world.objects.filter((o) => o.samples.length > 0).map((o) => describeObject(o, cameraSamples, opts.landmark ?? null))
  return { duration, fps, objects }
}
