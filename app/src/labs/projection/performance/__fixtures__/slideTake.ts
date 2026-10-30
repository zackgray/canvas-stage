// Test-only: a recorded take sliding 1 m along x over `seconds`, sampled at 30 fps on a 35 mm lens.
import type { CameraSample } from '../../../controller/take/types'
import type { WarpTake } from '../warpPlan'

export function slideTake(seconds: number, timelineStart = 0): WarpTake {
  const smoothed: CameraSample[] = Array.from({ length: Math.round(seconds * 30) + 1 }, (_, k) => ({
    t: k / 30, position: [k / 30 / seconds, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35,
  }))
  return { smoothed, timelineStart, viewAspect: 16 / 9 }
}
