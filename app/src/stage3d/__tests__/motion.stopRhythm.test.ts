// The last strides of Walk to a spot keep one walker's rhythm (2026-10-29). The first stop clip (CMU 133_11, a "baby styled walk")
// stepped at about 150 a minute against the walk loop's 105, with feet 30 cm apart and toes turned in 12 degrees: the last steps went
// 0.69, 0.47, 0.77 s and the hip surged as it took over. It was played 1.45x slower to hide that (the stop warp, retired with it). The
// stop is now CMU 16_34, a plain slow walk to a stop by a walker who moves like the loop's. Measured on the evaluator's output, the
// Stage's own take (mark to spot, padded), at 1/120 s; the stride fit's pass criteria (motion.strideFit.test.ts) must still hold.
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

const PACES = { slow: { pace: 0.6, gait: 'walk' }, walk: { pace: 0.8, gait: 'walk' }, brisk: { pace: 1, gait: 'walk' }, run: { pace: 1, gait: 'run' } } as const
const take = (m: number, id: keyof typeof PACES): PerformancePlan => ({ path: [[0, 0], [0, -m]], ...PACES[id], shotSeconds: 30, strideFit: true, softSettle: true })
const DT = 1 / 120

type Frame = { t: number; P: THREE.Vector3[] }
/** the take's world joint positions from `a` to 0.5 s after arrival */
function sample(plan: PerformancePlan, a: (stopT0: number) => number) {
  const tl = heroTimeline(plan, lib), ev = evaluator(tl), sk = lib.canon, { pos, rot } = fkBuffers(sk)
  const si = tl.segs.findIndex((g) => g.kind === 'stop'), S = tl.segs[si], W = tl.segs[si - 1], F: Frame[] = []
  for (let t = Math.max(0, a(S.t0)); t <= Math.min(tl.duration, S.t1 + 0.5); t += DT) { fk(sk, ev.pose(t), pos, rot); F.push({ t, P: pos.map((p) => p.clone()) }) }
  const end = ev.anchor(tl.duration), m = -plan.path[1][1]
  return { F, S, W, arrival: Math.hypot(end.x, end.z + m) }
}
const J = (n: string) => lib.canon.index[n]

/** toe pop and closest opposite landings (motion.strideFit.test.ts's measure) over F */
function fitChecks(F: Frame[]) {
  const toes = [J('LeftToeBase'), J('RightToeBase')], on = [false, false]
  let pop = 0, gap = Infinity, lastT = 0, lastK = -1
  for (let i = 1; i < F.length; i++) toes.forEach((j, k) => {
    const c = F[i].P[j], p = F[i - 1].P[j], v = Math.hypot(c.x - p.x, c.z - p.z) / DT, planted = c.y < FOOT_CLEAR + 0.02 && v < 0.35
    if (i > 1 && !planted && on[k]) pop = Math.max(pop, v)
    if (i > 1 && planted && !on[k]) { if (lastK >= 0 && lastK !== k) gap = Math.min(gap, F[i].t - lastT); lastT = F[i].t; lastK = k }
    on[k] = planted
  })
  return { pop, gap }
}

/** contacts as the metrics count them: a toe low and still, more than 0.12 s after that foot's last contact ended */
function contacts(F: Frame[]) {
  const toes = [J('LeftToeBase'), J('RightToeBase')], open: (number | null)[] = [null, null], heldTo = [-1e9, -1e9], out: { i: number; k: number }[] = []
  for (let i = 1; i < F.length; i++) toes.forEach((j, k) => {
    const c = F[i].P[j], p = F[i - 1].P[j], v = Math.hypot(c.x - p.x, c.z - p.z) / DT
    if (c.y < FOOT_CLEAR + 0.05 && v < 0.35) { if (open[k] === null && F[i].t - heldTo[k] > 0.12) { open[k] = F[i].t; out.push({ i, k }) } heldTo[k] = F[i].t }
    else if (F[i].t - heldTo[k] > 0.12) open[k] = null
  })
  return out.sort((x, y) => x.i - y.i)
}

/** the last strides: step times, the step-mean hip speed's largest rise, feet apart and toe-in at plant against the steady walk's */
function ending(m: number, id: keyof typeof PACES) {
  const { F, S, arrival } = sample(take(m, id), (t0) => t0 - 4)
  const cs = contacts(F), last = cs.filter((c) => F[c.i].t <= S.t1 + 0.3).slice(-4), steady = cs.filter((c) => F[c.i].t < S.t0 - 1)
  const steps = last.slice(1).map((c, j) => F[c.i].t - F[last[j].i].t)
  const foot = (c: { i: number; k: number }) => { const A = F[c.i].P[J(c.k ? 'RightFoot' : 'LeftFoot')], T = F[c.i].P[J(c.k ? 'RightToeBase' : 'LeftToeBase')], yaw = THREE.MathUtils.radToDeg(Math.atan2(T.x - A.x, -(T.z - A.z))); return { x: A.x, toeIn: c.k ? -yaw : yaw } }
  const geo = (l: typeof cs) => {
    const w = l.slice(1).flatMap((c, j) => (c.k !== l[j].k ? [Math.abs(foot(c).x - foot(l[j]).x)] : []))
    return { width: w.reduce((a, b) => a + b, 0) / w.length, toeIn: l.map((c) => foot(c).toeIn).reduce((a, b) => a + b, 0) / l.length }
  }
  // hip speed averaged over one step of the loop at this pace, from 1 s before the stop to half a step before arrival
  const H = J('Hips'), half = Math.round(lib.clips.walk.cycle / 4 / PACES[id].pace / DT)
  let lo = Infinity, rise = 0
  for (let i = 0; i < F.length; i++) {
    const t = F[i].t; if (t < S.t0 - 1 || t > S.t1 - half * DT) continue
    const a = F[Math.max(0, i - half)], b = F[Math.min(F.length - 1, i + half)], v = Math.hypot(b.P[H].x - a.P[H].x, b.P[H].z - a.P[H].z) / (b.t - a.t)
    lo = Math.min(lo, v); rise = Math.max(rise, v - lo)
  }
  return { steps, rise, end: geo(last), steady: geo(steady), arrival }
}

/** the largest change of a knee's angular speed between neighbouring frames (degrees/s per frame) over the last 3 s: a pop */
function kneeKick(m: number, id: keyof typeof PACES) {
  const { F, S } = sample(take(m, id), (t0) => t0 - 1.5), legs = [['LeftUpLeg', 'LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg', 'RightFoot']].map((l) => l.map(J))
  const ang = (f: Frame, [u, k, a]: number[]) => THREE.MathUtils.radToDeg(f.P[k].clone().sub(f.P[u]).angleTo(f.P[a].clone().sub(f.P[k])))
  let kick = 0
  for (let i = 2; i < F.length; i++) if (F[i].t >= S.t1 - 3) for (const L of legs) kick = Math.max(kick, Math.abs(ang(F[i], L) - 2 * ang(F[i - 1], L) + ang(F[i - 2], L)) / DT)
  return kick
}

describe('Walk to a spot: the last strides keep the walk\'s rhythm', () => {
  it('the last three steps come at an even rhythm, the hip only brakes, and the feet keep the walk\'s stance', () => {
    for (const id of ['slow', 'walk', 'brisk'] as const) for (const m of [4.0, 4.53, 5.5]) {
      const r = ending(m, id), say = `${id} ${m} m: steps ${r.steps.map((s) => s.toFixed(2)).join(' ')} rise ${r.rise.toFixed(2)} width ${(r.end.width * 100).toFixed(0)}/${(r.steady.width * 100).toFixed(0)} cm toe-in ${r.end.toeIn.toFixed(0)}/${r.steady.toeIn.toFixed(0)}`
      expect(r.steps.length, say).toBe(3)
      expect(Math.max(...r.steps) / Math.min(...r.steps), say).toBeLessThan(1.3) // today 1.16-1.23; the first stop clip 0.77 / 0.47 = 1.64
      expect(r.rise, say).toBeLessThan(0.1) // today at most 0.07 m/s; the first stop clip surged 0.24
      expect(Math.abs(r.end.width - r.steady.width), say).toBeLessThan(0.03) // today 12-13 cm against 12; the first stop clip 29-30
      expect(Math.abs(r.end.toeIn - r.steady.toeIn), say).toBeLessThan(8) // today 0-2 degrees against -4 to 9 (it varies with the
      // distance: the loop's own steps alternate); the first stop clip turned the toes in 11-13
    }
  })

  it('the stride fit holds at every distance and pace, and she arrives exactly on the spot', () => {
    const failed: string[] = []
    for (const id of Object.keys(PACES) as (keyof typeof PACES)[]) {
      for (let m = 2; m <= 12 + 1e-9; m += 0.25) {
        const { F, S, W, arrival } = sample(take(m, id), (t0) => t0 - 1.5), n = lib.canon.names.length
        const match = poseDistance(W.local(W.t1, makePose(n)), S.local(S.t0, makePose(n))), { pop, gap } = fitChecks(F)
        if (match > 0.46 || pop > 1.0 || gap < 0.25 || arrival > 1e-3) failed.push(`${id} ${m.toFixed(2)} m: match ${match.toFixed(3)} pop ${pop.toFixed(2)} gap ${gap.toFixed(2)} off ${arrival.toFixed(4)}`)
      }
    }
    expect(failed).toEqual([])
  }, 180_000)

  it('a run of any length eases into its walk without landing a foot twice (the 4.0-4.5 m double tap is gone)', () => {
    const failed: string[] = []
    for (let m = 2; m <= 7 + 1e-9; m += 0.25) {
      const { gap, pop } = fitChecks(sample(take(m, 'run'), () => 0).F) // the whole take, from the mark
      if (gap < 0.25 || pop > 1.0) failed.push(`${m.toFixed(2)} m: landings ${gap.toFixed(2)} s apart, toe ${pop.toFixed(2)} m/s`)
    }
    expect(failed).toEqual([])
  }, 60_000)

  it('no knee pops in the last strides at Slow walk, Walk and pace 1', () => {
    // today at most 116 degrees/s per frame (the first stop clip: 145-188); a knee straightening under a held toe used to stop at the
    // limit in a frame (motion/legIk.ts, the soft reach). The run's ease into its walk is not covered: it still kicks up to about 730
    for (const id of ['slow', 'walk', 'brisk'] as const) for (const m of [2.5, 4.0, 4.53, 5.5, 7.0]) {
      const k = kneeKick(m, id)
      expect(k, `${id} ${m} m: ${k.toFixed(0)}`).toBeLessThan(150)
    }
  }, 60_000)
})
