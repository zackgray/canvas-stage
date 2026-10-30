// The world track (pure): what every moving object did during a take, per frame, so a guide export reproduces it and
// the shot prompt can describe it. Exported with the take JSON and in a guide folder's cameras.json / meta.json:
//   worldTrack: { objects: [{ id: 'car', kind: 'car', label, samples: [{ t, position, heading, speed, visibleFraction? }] }] }
// t = seconds from the take's start (the camera samples' and guide frames' t); position metres, Y up; heading = yaw
// about +Y in the three.js convention (0 = facing +Z); speed m/s; visibleFraction = share of the object's box inside
// that frame's camera frustum (0 = out of frame, 1 = wholly in it).
import { threeFovDeg } from '../../controller/math/lens'
import type { CameraSample, Vec3T } from '../../controller/take/types'
import { add, cross, dot, mul, norm, rotate, sub, type Q4, type V3 } from './geom'
// the contract's types live with its reader, video/action.ts (one source of truth)
import type { WorldObject, WorldObjectSample, WorldTrack } from '../video/action'
import type { CarPose } from './path'

/** A moving object as the track records it: its pose at a world time, its ground normal and its box. */
export interface TrackSource {
  id: string
  kind: 'car'
  label: string
  poseAt(worldTime: number): CarPose
  up: V3
  /** box in the object's frame: length (forward), height (up), width; origin at the ground centre */
  size: V3
}

/** One frame's camera. */
export interface FrameCam { t: number; position: V3; quaternion: Q4; vfovDeg: number; aspect: number }

/** The take's cameras at the operator view's aspect (as recorded). */
export const takeCams = (samples: CameraSample[], aspect: number): FrameCam[] =>
  samples.map((s) => ({ t: s.t, position: s.position, quaternion: s.quaternion, vfovDeg: threeFovDeg(s.focal, aspect), aspect }))

/** The object's frame on its ground: +X forward along the heading, +Y the ground normal, +Z = X × Y. */
export function objectFrame(heading: number, up: V3) {
  const y = norm(up)
  const f: V3 = [Math.sin(heading), 0, Math.cos(heading)]
  const x = norm(sub(f, mul(y, dot(f, y))))
  return { x, y, z: norm(cross(x, y)) }
}

const GRID: [number, number, number] = [6, 3, 3]

/** Share of the box's sample points (a 6×3×3 lattice) in front of the camera and inside its frustum. */
export function visibleFraction(cam: FrameCam, pose: CarPose, up: V3, size: V3): number {
  const { x, y, z } = objectFrame(pose.heading, up)
  const [qx, qy, qz, qw] = cam.quaternion
  const inv: Q4 = [-qx, -qy, -qz, qw]
  const tv = Math.tan((cam.vfovDeg * Math.PI) / 360)
  const th = tv * cam.aspect
  let inside = 0, total = 0
  for (let i = 0; i < GRID[0]; i++) for (let j = 0; j < GRID[1]; j++) for (let k = 0; k < GRID[2]; k++) {
    const lx = (i / (GRID[0] - 1) - 0.5) * size[0], ly = (j / (GRID[1] - 1)) * size[1], lz = (k / (GRID[2] - 1) - 0.5) * size[2]
    const p = add(pose.position, add(add(mul(x, lx), mul(y, ly)), mul(z, lz)))
    const v = rotate(inv, sub(p, cam.position))
    const d = -v[2]
    total++
    if (d > 0.05 && Math.abs(v[0]) <= d * th && Math.abs(v[1]) <= d * tv) inside++
  }
  return inside / total
}

const r = (v: number, k = 4) => Number(v.toFixed(k))

/** Every source at each camera's world time (timelineStart + cam.t), with the visible fraction in that camera. */
export function recordTrack(sources: TrackSource[], cams: FrameCam[], timelineStart: number): WorldTrack {
  return {
    objects: sources.map((s) => ({
      id: s.id, kind: s.kind, label: s.label,
      samples: cams.map((c) => {
        const p = s.poseAt(timelineStart + c.t)
        return {
          t: r(c.t), position: p.position.map((v) => r(v)) as Vec3T, heading: r(p.heading, 5), speed: r(p.speed, 3),
          visibleFraction: r(visibleFraction(c, p, s.up, s.size), 3),
        }
      }),
    })),
  }
}

/** Shortest-way angle blend. */
function lerpAngle(a: number, b: number, k: number) {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * k
}

/** An object's pose at take time t from its samples (linear between samples; held before the first and after the last). */
export function trackPoseAt(obj: WorldObject, t: number): CarPose {
  const s = obj.samples
  if (s.length === 0) throw new Error(`empty track ${obj.id}`)
  const pose = (x: WorldObjectSample): CarPose => ({ position: [...x.position], heading: x.heading, speed: x.speed })
  if (t <= s[0].t) return pose(s[0])
  if (t >= s[s.length - 1].t) return pose(s[s.length - 1])
  let lo = 0, hi = s.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid].t <= t) lo = mid; else hi = mid }
  const a = s[lo], b = s[hi], k = (t - a.t) / (b.t - a.t)
  return {
    position: [0, 1, 2].map((i) => a.position[i] + (b.position[i] - a.position[i]) * k) as V3,
    heading: lerpAngle(a.heading, b.heading, k), speed: a.speed + (b.speed - a.speed) * k,
  }
}

/** The track replayed as sources (pose from the samples; the world time is mapped back to take time). */
export function trackSources(track: WorldTrack, timelineStart: number, like: (id: string) => Pick<TrackSource, 'up' | 'size'>): TrackSource[] {
  return track.objects.map((o) => ({ id: o.id, kind: o.kind, label: o.label, ...like(o.id), poseAt: (wt: number) => trackPoseAt(o, wt - timelineStart) }))
}
