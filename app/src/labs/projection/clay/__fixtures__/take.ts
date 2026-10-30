import type { ProcessedTake } from '../../../controller/take/processTake'
import type { CameraSample } from '../../../controller/take/types'

/** A take of `seconds` at 30 samples/s sliding along +x (1 unit/s), focal 35, started at world time `timelineStart`. */
export function fakeTake(seconds: number, opts: { timelineStart?: number; x0?: number; focal?: number } = {}): ProcessedTake {
  const n = Math.round(seconds * 30) + 1
  const smoothed: CameraSample[] = Array.from({ length: n }, (_, i) => ({
    t: i / 30, position: [(opts.x0 ?? 0) + i / 30, 1.6, 0], quaternion: [0, 0, 0, 1], focal: opts.focal ?? 35,
  }))
  return {
    raw: { fps: 30, timelineStart: opts.timelineStart ?? 0, rig: 'free', capSeconds: 20, smoothingAmount: 0.5, samples: smoothed, events: [] },
    smoothed, keyframes: smoothed, tolerance: 1, viewAspect: 16 / 9,
  } as unknown as ProcessedTake
}
