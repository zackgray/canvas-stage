// The walk stumble, take 3 (2026-10-29): the owner still saw a stumble at Slow walk, Walk and Run. Measured on the figure: as Walk to
// a spot hands over to its stop clip, the swinging toe skims the floor at swing speed (the first stop clip, CMU 133_11: 0.7 cm into
// it for 0.23 s at Walk and 0.32 s at Slow walk; today's, CMU 16_34: 0.6 cm into it for 0.11 to 0.17 s at every pace): a foot catching
// the ground mid-stride (motion/toeClear.ts). These pin it gone, and pin that the lift adds no pop of its own and leaves the walking
// loop alone.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../contract.ts'
import { FOOT_CLEAR } from '../motion/clip.ts'
import { heroTimeline } from '../motion/heroPlan.ts'
import type { Library } from '../motion/library.ts'
import { fk, fkBuffers } from '../motion/skeleton.ts'
import { evaluator } from '../motion/timeline.ts'
import { diskLibrary } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const PACES = [{ id: 'slow', pace: 0.6, gait: 'walk' }, { id: 'walk', pace: 0.8, gait: 'walk' }, { id: 'run', pace: 1, gait: 'run' }] as const
// with the marks every walk saved now carries (server/stage3d/strideFitStamp.ts; without the stride fit a run enters the stop on the
// wrong foot, which is the stride fit's to fix, not the toe lift's: motion.strideFit.test.ts)
const take = (m: number, p: (typeof PACES)[number]): PerformancePlan =>
  ({ path: [[0, 0], [0, -m]], pace: p.pace, gait: p.gait, shotSeconds: 8, strideFit: true, softSettle: true })

/** seconds a toe spends moving faster than 1.5 m/s within 0.5 cm of the floor (or below it), and the largest change in a toe's speed
 *  between neighbouring 1/120 s frames (m/s) */
function scrape(plan: PerformancePlan): { low: number; step: number } {
  const tl = heroTimeline(plan, lib), ev = evaluator(tl), sk = lib.canon, { pos, rot } = fkBuffers(sk), dt = 1 / 120
  const toes = ['LeftToeBase', 'RightToeBase'].map((n) => sk.index[n]), v0 = [0, 0]
  let prev: THREE.Vector3[] | null = null, low = 0, step = 0
  for (let i = 0; i * dt <= tl.duration; i++) {
    fk(sk, ev.pose(i * dt), pos, rot)
    const cur = toes.map((j) => pos[j].clone())
    if (prev) cur.forEach((c, k) => {
      const v = Math.hypot(c.x - prev![k].x, c.z - prev![k].z) / dt
      if (v > 1.5 && c.y < FOOT_CLEAR + 0.005) low += dt
      if (i > 1) step = Math.max(step, Math.abs(v - v0[k]))
      v0[k] = v
    })
    prev = cur
  }
  return { low, step }
}

describe('the swinging toe clears the floor', () => {
  it('no toe skims the floor at swing speed through Walk to a spot at Slow walk, Walk or Run (the stop clip comes in toe first)', () => {
    // without the lift, today's stop clip: slow 0.167 s, walk 0.117 s, run 0.117 s on 6 m (the toe 0.6 cm into the floor)
    for (const p of PACES) {
      const { low } = scrape(take(6, p))
      expect(low, `${p.id}: ${low.toFixed(3)} s`).toBeLessThan(0.02)
    }
  })

  it('the lift adds no pop: no toe changes speed between frames more than the hand-offs already did', () => {
    // the worst steps are the foot lock letting a toe go at a hand-off (with today's stop clip: slow 0.44 m/s, walk 0.42, run 0.76),
    // unchanged by the lift; the limits are the ones set against the first stop clip, kept
    const limit = { slow: 0.85, walk: 1.15, run: 0.85 }
    for (const p of PACES) {
      const { step } = scrape(take(6, p))
      expect(step, `${p.id}: ${step.toFixed(2)} m/s`).toBeLessThan(limit[p.id])
    }
  })

  it('stays pure in t: a frame asked for out of order is the same frame', () => {
    const tl = heroTimeline(take(6, PACES[1]), lib), sk = lib.canon, a = fkBuffers(sk), b = fkBuffers(sk)
    const inOrder = evaluator(tl), shuffled = evaluator(tl), times = Array.from({ length: 40 }, (_, i) => 3.5 + i * 0.025)
    const ref = times.map((t) => { fk(sk, inOrder.pose(t), a.pos, a.rot); return a.pos[sk.index.RightToeBase].clone() })
    for (const i of [...times.keys()].reverse()) {
      fk(sk, shuffled.pose(times[i]), b.pos, b.rot)
      expect(b.pos[sk.index.RightToeBase].distanceTo(ref[i])).toBeLessThan(1e-9)
    }
  })
})
