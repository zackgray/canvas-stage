// The walk stumble (2026-10-28): the owner saw a stumble at Slow walk, Walk and Run. Measured on the figure: the walk clip's left
// foot and toe flicked 20 to 37 degrees frame to frame at every toe-off and the hip lost a fifth of its speed for a frame (capture
// jitter, motion/smooth.ts), and a run dropped straight into the walking stop clip, losing three quarters of its speed in a sixth of
// a second (motion/gaitChain.ts). These pin both gone, on the Walk to a spot take the Stage builds (mark to spot, padded to the shot).
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../contract.ts'
import { heroTimeline } from '../motion/heroPlan.ts'
import type { Library } from '../motion/library.ts'
import { makePose } from '../motion/skeleton.ts'
import { evaluator } from '../motion/timeline.ts'
import { diskLibrary } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const PACES = [{ id: 'slow', pace: 0.6, gait: 'walk' }, { id: 'walk', pace: 0.8, gait: 'walk' }, { id: 'run', pace: 1, gait: 'run' }] as const
const take = (m: number, p: (typeof PACES)[number], more: Partial<PerformancePlan> = {}): PerformancePlan =>
  ({ path: [[0, 0], [0, -m]], pace: p.pace, gait: p.gait, shotSeconds: 8, ...more })

/**
 * the largest change in hip ground speed between neighbouring 1/30 s samples (m/s) while travelling and through each hand-off into a
 * stop clip; the stop clip's own last strides are left out (the capture there is someone planting their feet to stand, on purpose)
 */
function worstSpeedStep(plan: PerformancePlan): { step: number; at: number } {
  const tl = heroTimeline(plan, lib), ev = evaluator(tl), dt = 1 / 30
  const settling = (t: number) => tl.segs.some((g) => g.kind === 'stop' && g.decay !== Infinity && t > g.t0 + 0.5 && t <= g.t1 + 0.5)
  let px = 0, pz = 0, pv: number | null = null, step = 0, at = 0
  for (let i = 0; i * dt <= tl.duration; i++) {
    const r = ev.pose(i * dt).root
    if (i) {
      const v = Math.hypot(r.x - px, r.z - pz) / dt
      if (pv !== null && !settling(i * dt) && Math.abs(v - pv) > step) { step = Math.abs(v - pv); at = i * dt }
      pv = v
    }
    px = r.x; pz = r.z
  }
  return { step, at }
}

describe('the walk stumble', () => {
  it('no joint of the walk or run cycle flicks between neighbouring capture frames (the toe-off jitter is gone)', () => {
    // before the clean-up: the walk's LeftFoot turned 37 degrees and LeftToeBase 39 in one 1/120 s frame at file 0.83 s
    for (const id of ['walk', 'run'] as const) {
      const c = lib.clips[id], a = makePose(lib.canon.names.length), b = makePose(lib.canon.names.length)
      let worst = 0, where = ''
      for (let u = 0; u < c.cycle; u += 1 / 120) {
        c.loop(u, a); c.loop(u + 1 / 120, b)
        for (let j = 1; j < a.q.length; j++) {
          const d = THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(a.q[j].dot(b.q[j])))))
          if (d > worst) { worst = d; where = `${lib.canon.names[j]} at u ${u.toFixed(3)}` }
        }
      }
      expect(worst, `${id}: ${where}`).toBeLessThan(10)
    }
  })

  it('the hip never jolts through a Walk to a spot at Slow walk, Walk or Run (mid-stride, the run easing into its walk, the stop)', () => {
    // before: slow walk 0.12 and walk 0.14 m/s once per stride (the toe-off hitch); run 0.58 m/s as it fell into the walking stop
    const limit = { slow: 0.08, walk: 0.1, run: 0.3 }
    for (const p of PACES) {
      const { step, at } = worstSpeedStep(take(6, p))
      expect(step, `${p.id}: ${step.toFixed(3)} m/s at ${at.toFixed(2)} s`).toBeLessThan(limit[p.id])
    }
  })

  it('a run eases through a walking cycle into its stop, and out of a start back up to the run', () => {
    const run = PACES[2], tl = heroTimeline(take(10, run, { actions: [{ kind: 'stop', at: 5, seconds: 1 }] }), lib)
    expect(tl.segs.map((g) => g.kind)).toEqual(['travel', 'travel', 'stop', 'stop', 'start', 'travel', 'travel'])
    const { step, at } = worstSpeedStep(take(10, run, { actions: [{ kind: 'stop', at: 5, seconds: 1 }] }))
    // the worst step here is the designed walk-to-run acceleration at the end of the take (1.4 to 2.9 m/s over a 0.58 s ease), not a
    // hitch: 0.298 before the loop closure (motion.loopSeam.test.ts), 0.327 after it, only because the hand-off lands on another
    // phase of the stride. The bar is set for that ease; the run falling into its stop measured 0.58 before it was fixed.
    expect(step, `${step.toFixed(3)} m/s at ${at.toFixed(2)} s`).toBeLessThan(0.35)
  })

  it('a run leg too short for a running stride between its walks is walked; a run with no stop stays a run', () => {
    const run = PACES[2]
    expect(heroTimeline(take(3, run), lib).segs.map((g) => g.kind)).toEqual(['travel', 'stop', 'idle'])
    expect(heroTimeline({ path: [[0, 0], [0, -8]], pace: 1, gait: 'run' }, lib).segs.map((g) => g.kind)).toEqual(['travel'])
  })
})
