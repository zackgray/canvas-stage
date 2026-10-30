// Synthetic world tracks for the action tests: an object's position as a function of t, sampled at 24 fps, with the
// speed from the positions (central difference) and, optionally, a visible fraction per frame.
import type { Vec3T } from '../../../controller/take/types'
import type { WorldObject, WorldTrack } from '../action'
import { FPS } from './takes'

export function car(seconds: number, pos: (t: number) => Vec3T, opts: { id?: string; label?: string; visible?: (t: number) => number } = {}): WorldObject {
  const n = Math.round(seconds * FPS) + 1
  const h = 1 / (2 * FPS)
  return {
    id: opts.id ?? 'car',
    kind: 'car',
    label: opts.label ?? 'a red coupe',
    samples: Array.from({ length: n }, (_, i) => {
      const t = i / FPS
      const a = pos(t - h)
      const b = pos(t + h)
      const speed = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (2 * h)
      return { t, position: pos(t), heading: 0, speed, ...(opts.visible ? { visibleFraction: opts.visible(t) } : {}) }
    }),
  }
}

export const world = (...objects: WorldObject[]): WorldTrack => ({ objects })

/** Eases from v0 to rest at `stopAt` s: x(t) = x0 + d (1 - (1 - t/stopAt)^2), then holds. */
export const easeToStop = (x0: number, d: number, stopAt: number) => (t: number) => {
  const u = Math.min(1, Math.max(0, t / stopAt))
  return x0 + d * (1 - (1 - u) ** 2)
}
