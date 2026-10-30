import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../contract.ts'
import { compile, type Timeline } from '../motion/compile.ts'
import type { Library } from '../motion/library.ts'
import { evaluator } from '../motion/timeline.ts'
import { fk, fkBuffers } from '../motion/skeleton.ts'
import { performerFrom } from '../performer.ts'
import { ABOUT, BEND, KNEEL_END, KNEEL_UP, L_PATH, STRAIGHT, diskLibrary } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

/** world joint positions of the timeline's pose at t */
function joints(tl: Timeline, t: number): THREE.Vector3[] {
  const { pos, rot } = fkBuffers(lib.canon)
  fk(lib.canon, evaluator(tl).pose(t), pos, rot)
  return pos
}
const deg = (r: number) => THREE.MathUtils.radToDeg(r)

describe('motion timeline', () => {
  it('poseAt is pure in t: same t, same figure, whatever was asked in between', () => {
    const perf = performerFrom(L_PATH, () => 0, lib)
    const snap = () => perf.object.children.map((m) => [...m.position.toArray(), ...m.quaternion.toArray()])
    perf.poseAt(8.3); const first = snap()
    for (const t of [15.2, 0, 4.01, 11.99, 7.24, 3.3, 99, -1]) perf.poseAt(t)
    perf.poseAt(8.3)
    expect(snap()).toEqual(first)
    expect(perf.object.position.toArray()).toEqual([0, 0, 0]) // the stage owns object's transform
  })

  it('segments tile [0, duration] with no gaps', () => {
    for (const plan of [STRAIGHT, L_PATH, KNEEL_UP, KNEEL_END, ABOUT]) {
      const tl = compile(plan, lib)
      expect(tl.segs[0].t0).toBe(0)
      tl.segs.slice(1).forEach((g, i) => expect(g.t0).toBeCloseTo(tl.segs[i].t1, 9))
      const sum = tl.segs.reduce((a, g) => a + (g.t1 - g.t0), 0)
      expect(tl.duration).toBeCloseTo(sum, 9)
      expect(performerFrom(plan, () => 0, lib).duration).toBe(tl.duration)
    }
  })

  it('walks the path at the gait clip stride speed × pace (anchor at the right arc length)', () => {
    const plan: PerformancePlan = { ...STRAIGHT, pace: 0.9 }, perf = performerFrom(plan, (x) => 0.1 * x, lib), g = lib.clips.walk
    const v = (g.stride / g.cycle) * 0.9
    expect(perf.duration).toBeCloseTo(10 / v, 6)
    for (const t of [0, 1.7, 5, perf.duration]) {
      const a = perf.anchorAt(t)
      expect(a.x).toBeCloseTo(0, 9); expect(a.z).toBeCloseTo(-v * t, 6); expect(a.y).toBeCloseTo(0, 9)
    }
  })

  it('places actions: stop at the corner, stop / look / turn in order, kneel at the path end', () => {
    const tl = compile(L_PATH, lib), kinds = tl.segs.map((g) => g.kind)
    expect(kinds).toEqual(['travel', 'stop', 'stop', 'look', 'turn', 'start', 'travel'])
    const at = (k: number, t: number) => tl.segs[k].anchor(t)
    const stopClip = tl.segs[1], look = tl.segs[3], turn = tl.segs[4]
    expect(Math.hypot(at(1, stopClip.t1).x, at(1, stopClip.t1).z + 5)).toBeLessThan(1e-3) // the stop clip ends on the corner
    expect(tl.segs[2].t1 - tl.segs[2].t0).toBeCloseTo(1, 9)
    expect(look.t1 - look.t0).toBeCloseTo(2.5, 9)
    for (const t of [look.t0, look.t1, turn.t1]) { const a = tl.segs[3].anchor(t); expect([a.x, a.z]).toEqual([0, -5]) }
    expect(deg(turn.anchor(turn.t1).yaw - turn.anchor(turn.t0).yaw)).toBeCloseTo(-90, 6)
    const ev = evaluator(tl), end = ev.anchor(tl.duration)
    expect(end.x).toBeCloseTo(4, 6); expect(end.z).toBeCloseTo(-5, 6)

    const kn = compile(KNEEL_END, lib)
    expect(kn.segs.map((g) => g.kind)).toEqual(['travel', 'stop', 'kneel', 'kneel-hold'])
    const hold = kn.segs[3], hips = joints(kn, (hold.t0 + hold.t1) / 2)[0]
    expect(hips.y).toBeLessThan(0.75) // down on one knee
    expect(Math.hypot(hips.x, hips.z + 6)).toBeLessThan(0.6) // and at the end of the path
    expect(compile(KNEEL_UP, lib).segs.map((g) => g.kind)).toContain('kneel-up')
  })

  it('an action placed near a corner snaps onto it (stop and turn in place there, not a rounded walk past it)', () => {
    const tl = compile({ path: [[0, 0], [0, -5], [4, -5]], actions: [{ kind: 'turn', at: 4.6, deg: -90 }] }, lib)
    const turn = tl.segs.find((g) => g.kind === 'turn')!, a = turn.anchor(turn.t0)
    expect([a.x, a.z]).toEqual([0, -5])
    expect(tl.path.corners).toEqual([{ o: 5, turn: -Math.PI / 2, sharp: true }])
  })

  it('heading never jumps between 24 fps frames (rounded corners, eased turns, blended crossfades)', () => {
    for (const plan of [L_PATH, BEND, ABOUT, KNEEL_UP]) {
      const tl = compile(plan, lib), ev = evaluator(tl)
      let worst = 0
      for (let t = 1 / 24; t <= tl.duration; t += 1 / 24) {
        const d = Math.abs(Math.atan2(Math.sin(ev.heading(t) - ev.heading(t - 1 / 24)), Math.cos(ev.heading(t) - ev.heading(t - 1 / 24))))
        worst = Math.max(worst, deg(d))
      }
      expect(worst).toBeLessThan(6)
    }
  })

  it('no pops: no joint moves more than 8 cm between 120 fps frames, crossfades included', () => {
    for (const plan of [L_PATH, KNEEL_UP, ABOUT]) {
      const tl = compile(plan, lib)
      let prev = joints(tl, 0).map((v) => v.clone()), worst = 0, at = 0
      for (let t = 1 / 120; t <= tl.duration; t += 1 / 120) {
        const cur = joints(tl, t)
        cur.forEach((p, j) => { const d = p.distanceTo(prev[j]); if (d > worst) { worst = d; at = t } })
        prev = cur.map((v) => v.clone())
      }
      expect(worst, `worst jump at ${at.toFixed(3)} s`).toBeLessThan(0.08)
    }
  })
})
