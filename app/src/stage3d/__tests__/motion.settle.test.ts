// The settle snap (2026-10-29, motion/settle.ts). As a walk arrives, the stop clip crossfades into the idle (CMU 111) in 0.4 s and
// the two performers' upper bodies stand differently: with the first stop clip (CMU 133) the chest turned at 154 degrees/s; with
// today's (CMU 16_34) the head turns at 70-75, against the stop source's own peaks of 47 (chest) and 45 (head). With `softSettle` the
// upper body settles from the stop's last pose over 1.2 s, the lower back's offset taken through each clip's own pelvis. Measured on
// the evaluator's output (world rotations of the chest and head, 1/120 s), from 0.4 s before arrival to 2.5 s after.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../contract.ts'
import { heroTimeline } from '../motion/heroPlan.ts'
import type { Library } from '../motion/library.ts'
import { fk, fkBuffers } from '../motion/skeleton.ts'
import { evaluator } from '../motion/timeline.ts'
import { diskLibrary } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

/** the stop source's own peaks over its last 3 s (CMU 16_34 at 1x, on our skeleton: 46.5 and 45.0), degrees/s; today 12-21 and 40 */
const CHEST_MAX = 47, HEAD_MAX = 45
const PACES = { slow: { pace: 0.6, gait: 'walk' }, walk: { pace: 0.8, gait: 'walk' }, brisk: { pace: 1, gait: 'walk' }, run: { pace: 1, gait: 'run' } } as const
// padded to 30 s so the far spots are reached and stopped at too
const take = (m: number, id: keyof typeof PACES, soft: boolean): PerformancePlan =>
  ({ path: [[0, 0], [0, -m]], ...PACES[id], shotSeconds: 30, strideFit: true, ...(soft ? { softSettle: true } : {}) })

/** the chest's and head's fastest turn (degrees/s) around the arrival */
function settle(plan: PerformancePlan) {
  const tl = heroTimeline(plan, lib), ev = evaluator(tl), sk = lib.canon, { pos, rot } = fkBuffers(sk), DT = 1 / 120
  const S = tl.segs.find((g) => g.kind === 'stop')!, J = [sk.index.Spine1, sk.index.Head]
  let prev: THREE.Quaternion[] | null = null, chest = 0, head = 0
  for (let t = S.t1 - 0.4; t <= Math.min(tl.duration, S.t1 + 2.5); t += DT) {
    fk(sk, ev.pose(t), pos, rot)
    const now = J.map((j) => rot[j].clone())
    if (prev) { chest = Math.max(chest, THREE.MathUtils.radToDeg(now[0].angleTo(prev[0])) / DT); head = Math.max(head, THREE.MathUtils.radToDeg(now[1].angleTo(prev[1])) / DT) }
    prev = now
  }
  return { chest, head }
}

describe('Walk to a spot: the settle into standing', () => {
  it('the upper body turns no faster than the stop source does, at every pace and gait and distance', () => {
    const failed: string[] = []
    for (const id of Object.keys(PACES) as (keyof typeof PACES)[]) for (const m of [2, 3.5, 4, 5.5, 7, 9, 12]) {
      if (id === 'run' && m < 4.6) continue // a run under two strides eases straight into its walk (motion.strideFit.test.ts)
      const r = settle(take(m, id, true))
      if (r.chest > CHEST_MAX || r.head > HEAD_MAX) failed.push(`${id} ${m} m: chest ${r.chest.toFixed(0)} head ${r.head.toFixed(0)} degrees/s`)
    }
    expect(failed).toEqual([])
  }, 60_000)

  it('without the mark (every take locked before) the hand-off is the crossfade it was: the head turns faster than the source', () => {
    expect(settle(take(5, 'walk', false)).head).toBeGreaterThan(60) // 72 degrees/s
  })

  it('moves only the upper body: the root and the legs are exactly as before', () => {
    const sk = lib.canon, a = fkBuffers(sk), b = fkBuffers(sk)
    const legs = ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'].map((n) => sk.index[n])
    for (const id of ['slow', 'run'] as const) {
      const A = heroTimeline(take(5.5, id, false), lib), B = heroTimeline(take(5.5, id, true), lib), ea = evaluator(A), eb = evaluator(B)
      expect(B.duration).toBe(A.duration)
      let d = 0
      for (let t = 0; t <= A.duration; t += 1 / 30) {
        fk(sk, ea.pose(t), a.pos, a.rot); fk(sk, eb.pose(t), b.pos, b.rot)
        for (const j of legs) d = Math.max(d, a.pos[j].distanceTo(b.pos[j]))
      }
      expect(d, id).toBeLessThan(1e-9)
    }
  })
})
