// The car's path on the ground and its motion on the world clock (pure). Two clicks on the street set the start and
// the end; a start clicked near the frame edge is pushed out along the path so the car drives in from out of frame.
// Motion, as the controller lab's car: wait, accelerate, cruise; then stop at the end or drive on through it.
import { DEFAULT_CAP_SECONDS } from '../../controller/take/recorder'
import { add, len, mul, norm, sub, type V3 } from './geom'

export type SpeedPreset = 'crawl' | 'drive' | 'fast'
export type Arrival = 'stop' | 'through'

/** Cruise speed (m/s) and the acceleration (and braking) that reaches it. */
export const SPEEDS: Record<SpeedPreset, { speed: number; accel: number; label: string }> = {
  crawl: { speed: 3, accel: 1.5, label: 'Crawl (11 km/h)' },
  drive: { speed: 8, accel: 3, label: 'Drive (29 km/h)' },
  fast: { speed: 14, accel: 5, label: 'Fast (50 km/h)' },
}
export const ARRIVALS: Record<Arrival, string> = { stop: 'Stop at the end', through: 'Drive through' }

/** How far an edge click pushes the start out of frame, metres. */
export const EXTEND_M = 10
/** A click this close to the frame edge (in NDC, of 1) counts as "from out of frame". */
export const EDGE_MARGIN = 0.12
/** After arriving: the clock runs on this long (stopped: the car holds; through: it keeps driving). */
const HOLD_S = 1
const TAIL_S = 1.5

export interface CarPath {
  start: V3
  end: V3
  speed: SpeedPreset
  arrival: Arrival
  /** seconds the car waits at the start before pulling away */
  delay: number
}

export interface CarPose {
  position: V3
  /** yaw about +Y, three.js convention (0 = facing +Z), the controller lab's carPath heading */
  heading: number
  /** m/s */
  speed: number
}

export const nearFrameEdge = (ndc: { x: number; y: number }, margin = EDGE_MARGIN) =>
  Math.abs(ndc.x) > 1 - margin || Math.abs(ndc.y) > 1 - margin

/** Path ends from two clicks on the ground; a start near the frame edge is pushed `extend` m further out. */
export function pathFromClicks(a: V3, b: V3, startNearEdge: boolean, extend = EXTEND_M): { start: V3; end: V3 } {
  if (!startNearEdge || len(sub(a, b)) < 1e-6) return { start: a, end: b }
  return { start: add(a, mul(norm(sub(a, b)), extend)), end: b }
}

/** The start moved `m` metres further back along the path (the "start further out" button). */
export function extendStart(p: CarPath, m = 5): CarPath {
  return { ...p, start: pathFromClicks(p.start, p.end, true, m).start }
}

export interface Motion {
  length: number
  /** world time the car reaches the end */
  arrive: number
  /** the world clock's length for this path (at least a full default take) */
  duration: number
  /** distance along the path (past `length` when driving through) and speed at world time t */
  at(t: number): { s: number; v: number }
}

export function motion(p: CarPath): Motion {
  const L = len(sub(p.end, p.start))
  const { speed: V, accel: a } = SPEEDS[p.speed]
  const stop = p.arrival === 'stop'
  // stopping: accelerate, cruise, brake at the same rate; a path too short for cruise peaks at sqrt(a L)
  const peak = stop ? Math.min(V, Math.sqrt(a * L)) : V
  const tUp = peak / a
  const sUp = (a * tUp * tUp) / 2
  const sCruise = Math.max(0, L - (stop ? 2 : 1) * sUp)
  const tCruise = sCruise / peak
  // driving through: a path shorter than the run-up reaches its end while still accelerating
  const throughShort = !stop && L < sUp
  const arrive = p.delay + (stop ? 2 * tUp + tCruise : throughShort ? Math.sqrt((2 * L) / a) : tUp + tCruise)
  const duration = Math.max(DEFAULT_CAP_SECONDS, arrive + (stop ? HOLD_S : TAIL_S))
  const at = (t: number) => {
    const tt = t - p.delay
    if (tt <= 0 || L === 0) return { s: 0, v: 0 }
    if (tt < tUp) return { s: (a * tt * tt) / 2, v: a * tt }
    if (!stop || tt < tUp + tCruise) return { s: sUp + peak * (tt - tUp), v: peak }
    const tb = Math.min(tt - tUp - tCruise, tUp)
    return { s: Math.min(L, sUp + sCruise + peak * tb - (a * tb * tb) / 2), v: Math.max(0, peak - a * tb) }
  }
  return { length: L, arrive, duration, at }
}

/** Heading of a direction in the three.js convention. */
export const headingOf = (dir: V3) => Math.atan2(dir[0], dir[2])

/** Where the car is at world time t. */
export function poseAt(p: CarPath, t: number, m = motion(p)): CarPose {
  const dir = norm(sub(p.end, p.start))
  const { s, v } = m.at(t)
  return { position: add(p.start, mul(dir, s)), heading: headingOf(dir), speed: v }
}

/**
 * A short hash of everything that drives the car on the clock (ends to the millimetre, speed, arrival, delay): equal
 * hashes = the same motion. A still and a take each carry one (server/clip/pose.ts WorldStamp).
 */
export function pathHash(p: CarPath): string {
  const mm = (v: V3) => v.map((x) => Math.round(x * 1000)).join(',')
  const key = `${mm(p.start)}|${mm(p.end)}|${p.speed}|${p.arrival}|${Math.round(p.delay * 1000)}`
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0
  return `car-${h.toString(16).padStart(8, '0')}`
}
