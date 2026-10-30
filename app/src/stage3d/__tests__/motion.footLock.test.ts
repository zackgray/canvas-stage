// The crossfade skate (2026-10-28): after the loop seam was closed (motion.loopSeam.test.ts) the planted feet still slid wherever two
// clips handed off, because the crossfade blends two world poses that plant the foot on different spots (the shift lines up the hips,
// not the feet). Before the foot lock (motion/footLock.ts): Walk to a spot slid the planted right toe 14 cm at up to 1.2 m/s as the
// stop began, and 21 cm into the idle with neither clip moving it; a turn into a start slid it 15 to 17 cm. These pin a planted foot
// under 3 cm through every hand-off, and the hold neither lifts the toe off the floor nor pops the leg.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../contract.ts'
import { FOOT_CLEAR } from '../motion/clip.ts'
import { heroTimeline } from '../motion/heroPlan.ts'
import type { Library } from '../motion/library.ts'
import { segPose } from '../motion/segments.ts'
import { fk, fkBuffers, makePose } from '../motion/skeleton.ts'
import { evaluator, segIndex } from '../motion/timeline.ts'
import { diskLibrary, L_PATH } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const DT = 1 / 120, TOES = ['LeftToeBase', 'RightToeBase']
// with the marks every walk saved now carries (server/stage3d/strideFitStamp.ts): since the stop clip became CMU 16_34, a run without
// the stride fit enters the stop on the wrong foot and its toe dips 4 cm into the floor at 6 m; no take in use is without them
const take = (m: number, pace: number, gait: 'walk' | 'run', more: Partial<PerformancePlan> = {}): PerformancePlan =>
  ({ path: [[0, 0], [0, -m]], pace, gait, shotSeconds: 8, strideFit: true, softSettle: true, ...more })
const TAKES: [string, PerformancePlan][] = [
  ['Walk to a spot, slow walk', take(6, 0.6, 'walk')], ['Walk to a spot, walk', take(6, 0.8, 'walk')], ['Walk to a spot, run', take(6, 1, 'run')],
  ['run, stop, run', take(10, 1, 'run', { actions: [{ kind: 'stop', at: 5, seconds: 1 }] })],
  ['walk, stop, walk', take(10, 0.8, 'walk', { actions: [{ kind: 'stop', at: 5, seconds: 1 }] })],
  ['stop, look, turn, start', L_PATH],
  ['idle, turn, start', { path: [[0, 0], [0, -6]], pace: 0.8, actions: [{ kind: 'idle', at: 0, seconds: 2 }, { kind: 'turn', at: 0, deg: 60 }] }],
]

/**
 * the furthest a toe travels on the floor while the clip playing plants it (in that segment's own world pose: within 1.2 cm of its
 * resting height and slower than 0.2 m/s), within 0.2 s of a crossfade
 */
function worstSlide(plan: PerformancePlan): { slide: number; where: string } {
  const tl = heroTimeline(plan, lib), ev = evaluator(tl), idx = TOES.map((n) => lib.canon.index[n])
  const { pos, rot } = fkBuffers(lib.canon), P = makePose(lib.canon.names.length)
  const segToe = (i: number, t: number, k: number) => { segPose(tl.segs[i], t, P); fk(lib.canon, P, pos, rot); return pos[idx[k]].clone() }
  const planted = (t: number, k: number) => {
    const i = segIndex(tl, t), a = segToe(i, t, k), b = segToe(i, t + DT, k)
    return a.y < FOOT_CLEAR + 0.012 && Math.hypot(b.x - a.x, b.z - a.z) / DT < 0.2
  }
  let slide = 0, where = ''
  tl.segs.forEach((g, n) => {
    if (!n) return
    const w0 = Math.max(0, g.t0 - tl.xf[n] / 2 - 0.2), w1 = Math.min(tl.duration - DT, g.t0 + tl.xf[n] / 2 + 0.2)
    for (let k = 0; k < 2; k++) {
      let run = 0, prev: THREE.Vector3 | null = null
      for (let t = w0; t <= w1; t += DT) {
        fk(lib.canon, ev.pose(t), pos, rot)
        const c = pos[idx[k]].clone(), on = planted(t, k)
        run = on && prev ? run + Math.hypot(c.x - prev.x, c.z - prev.z) : 0
        if (run > slide) { slide = run; where = `${k ? 'right' : 'left'} toe, ${tl.segs[n - 1].kind} into ${g.kind} at ${g.t0.toFixed(2)} s` }
        prev = on ? c : null
      }
    }
  })
  return { slide, where }
}

describe('planted feet through the hand-offs', () => {
  it('a planted toe slides under 3 cm through every hand-off (walk, slow walk, run; stop, idle, look, turn, start)', () => {
    for (const [name, plan] of TAKES) {
      const { slide, where } = worstSlide(plan)
      expect(slide, `${name}: ${(slide * 100).toFixed(1)} cm, ${where}`).toBeLessThan(0.03)
    }
  })

  it('the hold keeps the toes at the clip\'s own height and no leg joint pops (Walk to a spot and the about-turn)', () => {
    const about: PerformancePlan = { path: [[0, 0], [0, -5], [0.01, 0]], actions: [{ kind: 'turn', at: 5, deg: 180 }], strideFit: true, softSettle: true }
    for (const plan of [TAKES[1][1], TAKES[2][1], about]) {
      const tl = heroTimeline(plan, lib), ev = evaluator(tl), { pos, rot } = fkBuffers(lib.canon)
      const legs = ['LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', ...TOES].map((n) => lib.canon.index[n])
      let low = Infinity, jump = 0, prev: THREE.Vector3[] | null = null
      for (let t = 0; t <= tl.duration; t += DT) {
        fk(lib.canon, ev.pose(t), pos, rot)
        const cur = legs.map((j) => pos[j].clone())
        low = Math.min(low, ...cur.slice(4).map((p) => p.y))
        if (prev) cur.forEach((p, j) => { jump = Math.max(jump, p.distanceTo(prev![j])) })
        prev = cur
      }
      expect(low, 'a toe sank into the floor').toBeGreaterThan(FOOT_CLEAR - 0.015)
      expect(jump, 'a leg joint jumped between 120 fps frames').toBeLessThan(0.08)
    }
  })
})
