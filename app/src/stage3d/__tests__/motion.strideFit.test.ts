// Walk to a spot, the stride fit (2026-10-29, motion/strideFit.ts). The walk's footfalls were fixed from the mark and the stop
// clip's from the spot, so at about half of all distances (2.5, 4.0, 5.5 m and every 1.47 m after) the walk crossfaded into a stop
// on the wrong foot: both feet landing together, a planted toe snatched off the floor at up to 3.9 m/s. A plan with `strideFit`
// starts the stride at the phase that lands it on the stop's best entry. Measured on the evaluator's output, the Stage's own take
// (mark to spot, padded to the shot), from 1.5 s before the stop clip's first frame to 0.5 s after its last, at 1/120 s.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../contract.ts'
import { FOOT_CLEAR, poseDistance } from '../motion/clip.ts'
import { heroTimeline } from '../motion/heroPlan.ts'
import type { Library } from '../motion/library.ts'
import { fk, fkBuffers, makePose } from '../motion/skeleton.ts'
import { evaluator } from '../motion/timeline.ts'
import { diskLibrary } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const PACES = { slow: { pace: 0.6, gait: 'walk' }, walk: { pace: 0.8, gait: 'walk' }, run: { pace: 1, gait: 'run' } } as const
// padded to 30 s, not the Stage's 8, so the far spots are reached and stopped at too (in an 8 s take they walk through the shot)
const take = (m: number, id: keyof typeof PACES, fit: boolean): PerformancePlan =>
  ({ path: [[0, 0], [0, -m]], ...PACES[id], shotSeconds: 30, ...(fit ? { strideFit: true } : {}) })

/** the hand-off's pose mismatch, the fastest planted toe snatched off the floor (m/s), the closest opposite-foot landings (s) */
function ending(plan: PerformancePlan) {
  const tl = heroTimeline(plan, lib), ev = evaluator(tl), sk = lib.canon, n = sk.names.length
  const si = tl.segs.findIndex((g) => g.kind === 'stop'), S = tl.segs[si], W = tl.segs[si - 1]
  const a = makePose(n), b = makePose(n), { pos, rot } = fkBuffers(sk), toes = [sk.index.LeftToeBase, sk.index.RightToeBase], DT = 1 / 120
  const match = poseDistance(W.local(W.t1, a), S.local(S.t0, b))
  let prev: THREE.Vector3[] | null = null, i = 0, pop = 0, gap = Infinity, lastT = 0, lastK = -1
  const on = [false, false]
  for (let t = Math.max(0, S.t0 - 1.5); t <= Math.min(tl.duration, S.t1 + 0.5); t += DT, i++) {
    fk(sk, ev.pose(t), pos, rot)
    const now = toes.map((j) => pos[j].clone())
    if (prev) now.forEach((c, k) => {
      const v = Math.hypot(c.x - prev![k].x, c.z - prev![k].z) / DT, planted = c.y < FOOT_CLEAR + 0.02 && v < 0.35
      if (i > 1 && !planted && on[k]) pop = Math.max(pop, v)
      if (i > 1 && planted && !on[k]) { if (lastK >= 0 && lastK !== k) gap = Math.min(gap, t - lastT); lastT = t; lastK = k }
      on[k] = planted
    })
    prev = now
  }
  return { match, pop, gap, arrive: S.t1 }
}
const bad = (r: ReturnType<typeof ending>) => r.match > 0.46 || r.pop > 1.0 || r.gap < 0.25
const say = (m: number, r: ReturnType<typeof ending>) => `${m.toFixed(1)} m: match ${r.match.toFixed(3)} pop ${r.pop.toFixed(2)} m/s landings ${r.gap.toFixed(2)} s apart`

describe('Walk to a spot: the stride fit', () => {
  it('the distances that stumbled (2.5, 4.0, 5.5 m) end cleanly at Walk and Slow walk', () => {
    for (const id of ['slow', 'walk'] as const) for (const m of [2.5, 4.0, 5.5]) {
      const r = ending(take(m, id, true))
      expect(bad(r), `${id} ${say(m, r)}`).toBe(false)
    }
  })

  it('every distance from 2 to 12 m ends cleanly at Walk and Slow walk, and from 4.6 to 12 m at Run', () => {
    // Run 4.0-4.5 m is left out: the run there is under a stride and its ease into the walk taps the right foot twice in the first
    // second of the take (0.1 s between landings), with or without the fit; its stop hand-off itself is clean (match 0.43, toe 0.9 m/s)
    const failed: string[] = []
    for (const [id, lo] of [['slow', 2], ['walk', 2], ['run', 4.6]] as const) {
      for (let m = lo; m <= 12 + 1e-9; m += 0.1) { const r = ending(take(m, id, true)); if (bad(r)) failed.push(`${id} ${say(m, r)}`) }
    }
    expect(failed).toEqual([])
  }, 60_000)

  it('the figure still arrives at the spot, within a tenth of a second of the unfitted take at Walk', () => {
    for (const m of [2.5, 4.0, 5.5, 7.0]) {
      const fit = ending(take(m, 'walk', true)).arrive, old = ending(take(m, 'walk', false)).arrive
      expect(Math.abs(fit - old), `${m} m`).toBeLessThan(0.12)
      const tl = heroTimeline(take(m, 'walk', true), lib), end = evaluator(tl).anchor(tl.duration)
      expect(Math.hypot(end.x, end.z + m), `${m} m`).toBeLessThan(0.05)
    }
  })

  it('a plan without strideFit (every take locked before the fit) still starts the walk at phase 0', () => {
    const n = lib.canon.names.length, a = makePose(n), b = makePose(n)
    const old = heroTimeline(take(5.5, 'walk', false), lib).segs[0], fit = heroTimeline(take(5.5, 'walk', true), lib).segs[0]
    lib.clips.walk.loop(0, b)
    expect(poseDistance(old.local(old.t0, a), b)).toBeLessThan(1e-6)
    expect(poseDistance(fit.local(fit.t0, a), b)).toBeGreaterThan(0.05)
  })
})
