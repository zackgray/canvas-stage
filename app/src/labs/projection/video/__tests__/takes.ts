// Synthetic takes for the motion and prompt tests: a pose as a function of progress u (0..1) over a take of `seconds`.
import { Euler, Quaternion } from 'three'
import type { CameraSample, QuatT, Vec3T } from '../../../controller/take/types'

export const FPS = 24
export const RAD = Math.PI / 180

export function quat(yaw: number, pitch = 0, roll = 0): QuatT {
  const q = new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, 'YXZ'))
  return [q.x, q.y, q.z, q.w]
}

export interface Pose {
  pos?: Vec3T
  /** radians */
  yaw?: number
  pitch?: number
  roll?: number
  focal?: number
}

/** Eye height, looking down -Z, 35 mm, unless the pose says otherwise. */
export function take(seconds: number, f: (u: number, t: number) => Pose): CameraSample[] {
  const n = Math.round(seconds * FPS) + 1
  return Array.from({ length: n }, (_, i): CameraSample => {
    const t = i / FPS
    const p = f(i / (n - 1), t)
    return { t, position: p.pos ?? [0, 1.6, 0], quaternion: quat(p.yaw ?? 0, p.pitch ?? 0, p.roll ?? 0), focal: p.focal ?? 35, focus: 10 }
  })
}

export const linear = (u: number) => u
export const smooth = (u: number) => u * u * (3 - 2 * u)
export const accel = (u: number) => u * u

/** Deterministic small noise in [-1, 1] (no Math.random, so tests are repeatable). */
export const jitter = (i: number, k: number) => Math.sin(i * 12.9898 + k * 78.233) * Math.cos(i * 4.1414 + k * 2.71)
