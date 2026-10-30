// Wave A fix (F1): the facing the arrow and the live figure show is the facing the compiled hero starts with. A walk starts along its
// first leg (whatever way the mark is turned); only a stand faces the mark's yaw. Checked against the real compiler and library.
import { beforeAll, describe, expect, it } from 'vitest'
import type { MarkPlan, PerformancePlan } from '../contract'
import { heroTimeline } from '../motion/heroPlan'
import type { Library } from '../motion/library'
import { wrapAngle } from '../motion/path'
import { standPath } from '../motion/standPlan'
import { startFacingDeg } from '../motion/startFacing'
import { evaluator } from '../motion/timeline'
import * as F from './motion.fixture'

let lib: Library
beforeAll(async () => { lib = await F.diskLibrary() }, 60_000)

const RAD = Math.PI / 180
/** degrees between the rule's facing and the compiled hero's heading at t = 0 */
const off = (perf: PerformancePlan, markYawDeg: number) => {
  const ev = evaluator(heroTimeline(perf, lib))
  return Math.abs(wrapAngle(startFacingDeg(perf, markYawDeg) * RAD - ev.heading(0))) / RAD
}

describe('startFacingDeg follows the compiler', () => {
  const MARK: MarkPlan = { at: [1.5, -9], yawDeg: 90 } // turned to face +x
  it('a walk drawn the other way from the mark starts along its first leg, not the mark', () => {
    const walk: PerformancePlan = { path: [[1.5, -9], [1.5, -15], [4, -18]], pace: 0.8 } // heads -z
    expect(startFacingDeg(walk, MARK.yawDeg!)).toBeCloseTo(180)
    expect(off(walk, MARK.yawDeg!)).toBeLessThan(1)
    expect(Math.abs(wrapAngle(evaluator(heroTimeline(walk, lib)).heading(0) - MARK.yawDeg! * RAD)) / RAD).toBeGreaterThan(80)
  })
  it('a stand faces the mark\'s yaw, and so does the compiled stand', () => {
    const stand: PerformancePlan = { path: standPath(MARK), pace: 0.8, stand: true }
    expect(startFacingDeg(stand, MARK.yawDeg!)).toBe(90)
    expect(off(stand, MARK.yawDeg!)).toBeLessThan(1)
  })
  it('every fixture walk: the rule equals the compiled heading at the start', () => {
    for (const p of [F.STRAIGHT, F.L_PATH, F.KNEEL_UP, F.KNEEL_END, F.BEND, F.ABOUT, F.LIFT_END, F.LIFT_ON, F.LIFT_HERE]) {
      expect(off(p, 37)).toBeLessThan(1)
    }
  })
  it('one point, no performance, or repeated points fall back to the mark; a moved mark carries the start', () => {
    expect(startFacingDeg({ path: [[0, 0]] }, 45)).toBe(45)
    expect(startFacingDeg(null, 45)).toBe(45)
    expect(startFacingDeg({ path: [[0, 0], [0, 0]] }, 45)).toBe(45)
    expect(startFacingDeg({ path: [[0, 0], [0, 0], [3, 0]] }, 45)).toBeCloseTo(90)
    expect(startFacingDeg({ path: [[0, 0], [0, 5]] }, 45, [-5, 5])).toBeCloseTo(90)
  })
})
