// Shared fixture for the motion tests: the clip library read from disk, and the plans the tests drive.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PerformancePlan } from '../contract.ts'
import { loadLibrary, type Library } from '../motion/library.ts'

const PUBLIC = fileURLToPath(new URL('../../../public', import.meta.url))
let lib: Promise<Library> | null = null
export const diskLibrary = () => (lib ??= loadLibrary(async (u) => readFileSync(PUBLIC + u, 'utf8')))
export const readClip = (u: string) => readFileSync(PUBLIC + u, 'utf8')

export const STRAIGHT: PerformancePlan = { path: [[0, 0], [0, -10]] }
/** walk 5 m, stop 1 s, look 50° left for 2.5 s, turn 90° right, walk 4 m */
export const L_PATH: PerformancePlan = {
  path: [[0, 0], [0, -5], [4, -5]],
  actions: [{ kind: 'stop', at: 5, seconds: 1 }, { kind: 'look', at: 5, deg: 50, seconds: 2.5 }, { kind: 'turn', at: 5, deg: -90 }],
}
export const KNEEL_UP: PerformancePlan = { path: [[0, 0], [0, -5], [0, -9]], actions: [{ kind: 'kneel', at: 5, seconds: 1.5 }] }
export const KNEEL_END: PerformancePlan = { path: [[0, 0], [0, -6]], actions: [{ kind: 'kneel', at: 6, seconds: 2 }] }
export const BEND: PerformancePlan = { path: [[0, 0], [0, -5], [4, -8], [4, -14]] }
export const ABOUT: PerformancePlan = { path: [[0, 0], [0, -5], [0.01, 0]], actions: [{ kind: 'turn', at: 5, deg: 180 }] }
/** lift a frame from a hive at the end of a 4 m walk (held to the end), or with more path after it (lowered back, then on) */
export const LIFT_END: PerformancePlan = { path: [[0, 0], [0, -4]], actions: [{ kind: 'lift', at: 4, seconds: 2 }] }
export const LIFT_ON: PerformancePlan = { path: [[0, 0], [0, -4], [0, -7]], actions: [{ kind: 'lift', at: 4, seconds: 1.5 }] }
/** the lift right at the mark: frame 0 is the lift's standing start */
export const LIFT_HERE: PerformancePlan = { path: [[0, 0], [0, -0.1]], actions: [{ kind: 'lift', at: 0, seconds: 3 }] }
