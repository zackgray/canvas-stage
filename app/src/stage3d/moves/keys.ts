/**
 * Hand targets from the Set (plan section 2.3): per-class key schedules scaled to the measured piece and the asked window.
 * The worked example is the spike's lift_hi_spec (constraints/lift_hi_spec.json): for a hive with its rim at 0.70 m and its
 * near face 0.36 m in front, an 8 s window at 30 fps gives exactly those five keys (75/100/140/190/235), each wrist at ±grip/2.
 * Every key carries a base pose name from the box's small bank (reach-low, hold-chest, hold-high, stand). Gestures send no keys
 * (text only). The end key always sits 5 frames before the window's last frame, against the sag after the last key. Pure.
 */
import type { BasePose, MoveClass, MoveKey, Vec3 } from './types.ts'

export const FPS = 30
/** the default window the schedules are written for; other windows scale linearly */
export const BASE_SECONDS = 8
/** the head-height and chest-height hand targets, metres (performer-local, standing figure) */
const HEAD_Y = 1.6
const CHEST_Y = 1.2
/** hands never asked below this, and no piece nearer than this */
const MIN_REACH_Y = 0.06
const MIN_FRONT = 0.15
/**
 * The working band the reach keys stay in, whatever the piece measures (QA run 5): the keys must be reachable from the bank's
 * reach-low pose, or the box's IK clamps the arms, the constraint holds the hands nearer together than the spec asks, and every
 * try then fails the grip check against the spec (16 of 16). A tall piece (an oven, a raised fire: top 2.3 m) is worked at its
 * opening's height, not its top; a far one at arm's length. The box's IK reaches every key of this band exactly (checked
 * against the shipped bank: rims 0.3 to 1.0 m, near faces 0.15 to 0.6 m).
 */
export const WORK_RIM_MAX = 0.9
export const WORK_FRONT_MAX = 0.6
/** the handled object's grip width: clamped to this band unless a known prop gives it (the frame is 0.42 m) */
export const GRIP_MIN = 0.3
export const GRIP_MAX = 0.55

export type KeyMeasure = { front: number; rimOrTop: number; grip: number }

export type KeyTimes = {
  keys: MoveKey[]
  /** seconds at which the hands take the object (unset = held from the start) */
  grab?: number
  /** seconds at which the hands let go (unset = kept) */
  release?: number
  /** the held window [from, to] seconds */
  hold?: [number, number]
}

/** the grip clamps to the band whatever the caller measured */
export const clampGrip = (grip: number): number => Math.min(Math.max(grip, GRIP_MIN), GRIP_MAX)

/**
 * The schedules. Times are baseline-8 s seconds, scaled by the asked window; `end` marks the window's own end key (5 frames
 * early). `rim`/`front` read the measured piece; fixed heights are body targets. Each row: [time, height, depth, pose].
 */
type Row = [number | 'end', number | 'rim+0.10' | 'rim+0.32' | 'rim+0.06', number | 'front+0.06' | 'front+0.02', BasePose]
const SCHEDULES: Record<Exclude<MoveClass, 'gesture'>, { rows: Row[]; grabRow?: number; releaseRow?: number; holdFrom?: number }> = {
  // the lift: grip at the rim, clear, rise to head height, hold, end key against the sag
  takeOut: {
    rows: [[2.5, 'rim+0.10', 'front+0.06', 'reach-low'], [3.3333, 'rim+0.32', 'front+0.02', 'reach-low'],
      [4.6667, HEAD_Y, 0.4, 'hold-high'], [6.3333, HEAD_Y + 0.02, 0.42, 'hold-high'], ['end', HEAD_Y, 0.4, 'hold-high']],
    grabRow: 0, holdFrom: 4.6667,
  },
  // reach to the floor or top, chest, hold, end key
  pickUp: {
    rows: [[2, 'rim+0.06', 'front+0.02', 'reach-low'], [4, CHEST_Y, 0.3, 'hold-chest'], [5.5, CHEST_Y + 0.02, 0.32, 'hold-chest'],
      ['end', CHEST_Y, 0.3, 'hold-chest']],
    grabRow: 0, holdFrom: 4,
  },
  // chest hold, lower to the surface, release, stand, end key
  putDown: {
    rows: [[0.5, CHEST_Y, 0.3, 'hold-chest'], [4, 'rim+0.06', 'front+0.02', 'reach-low'], [4.5, 'rim+0.06', 'front+0.02', 'reach-low'],
      [6.6667, 0.8, 0.3, 'stand'], ['end', 0.8, 0.3, 'stand']],
    releaseRow: 2,
  },
  // already held at chest, head height, hold, end key
  holdUp: {
    rows: [[1, CHEST_Y, 0.3, 'hold-chest'], [4, HEAD_Y, 0.4, 'hold-high'], [6, HEAD_Y + 0.02, 0.42, 'hold-high'],
      ['end', HEAD_Y, 0.4, 'hold-high']],
    holdFrom: 4,
  },
}

export function keysFor(cls: MoveClass, m: KeyMeasure, seconds: number): KeyTimes {
  if (cls === 'gesture') return { keys: [] }
  const sch = SCHEDULES[cls]
  const k = seconds / BASE_SECONDS
  const rim = Math.min(m.rimOrTop, WORK_RIM_MAX)
  const front = Math.min(Math.max(m.front, MIN_FRONT), WORK_FRONT_MAX)
  const grip = clampGrip(m.grip) / 2
  const h = (v: Row[1]): number => (typeof v === 'number' ? v : rim + Number(v.slice(3)))
  const d = (v: Row[2]): number => (typeof v === 'number' ? v : front + Number(v.slice(5)))
  const keys: MoveKey[] = sch.rows.map(([t, y, z, pose]) => {
    const frame = t === 'end' ? Math.round((seconds - 5 / FPS) * FPS) : Math.round(t * k * FPS)
    const yy = Math.max(h(y), MIN_REACH_Y), zz = d(z)
    return { frame, hands: { Left: [grip, yy, zz] as Vec3, Right: [-grip, yy, zz] as Vec3 }, pose }
  })
  const grab = sch.grabRow !== undefined ? keys[sch.grabRow].frame / FPS : undefined
  const release = sch.releaseRow !== undefined ? keys[sch.releaseRow].frame / FPS : undefined
  const hold: [number, number] | undefined = sch.holdFrom !== undefined ? [sch.holdFrom * k, seconds] : undefined
  return { keys, grab, release, hold }
}

