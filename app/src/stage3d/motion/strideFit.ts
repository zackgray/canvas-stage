/**
 * Walk to a spot, the stride fit (2026-10-29). The walk's footfalls were fixed from the mark (the loop always started at phase 0) and
 * the stop clip's from the spot, so where they met, two steps out, they agreed only when the distance happened to be close to a
 * whole number of strides: at about half of all distances a walk saying "right foot planted" crossfaded into a stop saying the
 * opposite, and the feet tapped, double-landed and snatched. Searching the stop's entry frame could not fix it (the stop's walker
 * moves at the walk's own speed, so the mismatch slides along with it).
 *
 * A leg that does not start from rest has a free starting phase. This picks it so the gait reaching the stop ends on the walk phase
 * that matches the stop clip's entry best: the clip pair's best (walk phase, entry frame) is found once, then the first stretch's
 * phase is worked back from the travel. Only plans that carry `strideFit` (paths saved after the fit landed) take it, so a take
 * locked before keeps its frames. Pure.
 */
import { poseDistance, type Clip } from './clip.ts'
import { makePose } from './skeleton.ts'

/** the best walk-into-stop pair: walk loop phase (s), stop entry frame (file time, s), and their pose distance */
export type StopFit = { phase: number; entry: number; d: number }

const memo = new WeakMap<Clip, WeakMap<Clip, StopFit>>()
const wrap = (u: number, c: number) => ((u % c) + c) % c

/** the walk phase (1/120 s over its cycle) and stop entry frame (1/60 s over its entry window) whose poses match best; once per pair */
export function stopFit(walk: Clip, stop: Clip, joints: number): StopFit {
  let byStop = memo.get(walk)
  if (!byStop) memo.set(walk, (byStop = new WeakMap()))
  let fit = byStop.get(stop)
  if (fit) return fit
  const [e0, e1] = stop.def.enter ?? [stop.def.in, stop.def.in], a = makePose(joints), b = makePose(joints)
  fit = { phase: 0, entry: e0, d: Infinity }
  for (let x = e0; x <= e1 + 1e-9; x += 1 / 60) {
    stop.once(x, b)
    for (let u = 0; u < walk.cycle; u += 1 / 120) {
      const d = poseDistance(walk.loop(u, a), b)
      if (d < fit.d) fit = { phase: u, entry: x, d }
    }
  }
  byStop.set(stop, fit)
  return fit
}

/** seconds either side of the run-to-walk seam the ease is judged over (compile.ts XF_EASE is 0.6 s), and the run phases' tolerance */
const EASE_HALF = 0.3, NEAR = 2 / 60

/**
 * the first stretch's phase for a leg that does not start from rest and ends in the stop, `travel` metres of gait before the stop
 * enters at fit.entry. The walk (one stretch): worked back from fit.phase. A faster gait (the run, then one walking cycle into the
 * stop, motion/gaitChain.ts; the walking cycle is exactly one stride, so it ends where it began): of its phases on the 1/60 s grid
 * whose matched walk lands within NEAR of fit.phase, the one whose run and walk poses agree best across the ease's crossfade (the
 * nearest alone left the feet landing 0.1 s apart as the run eased into its walk at about half of all distances).
 */
export function fittedPhase0(first: Clip, walk: Clip, travel: number, fit: StopFit, pace: number, joints: number,
  match: (from: Clip, u: number, to: Clip) => number): number {
  if (first === walk) return wrap(fit.phase - (travel / walk.stride) * walk.cycle, walk.cycle)
  const len = travel - walk.stride, half = walk.cycle / 2, a = makePose(joints), b = makePose(joints)
  const cands: { p: number; off: number; end: number; w: number }[] = []
  for (let p = 0; p < first.cycle; p += 1 / 60) {
    const end = p + (len / first.stride) * first.cycle, w = match(first, end, walk)
    cands.push({ p, end, w, off: Math.abs(wrap(w - fit.phase + half, walk.cycle) - half) })
  }
  const nearest = Math.min(...cands.map((c) => c.off))
  // the ease's crossfade is capped at 0.9 of a short run's own length (compile.ts)
  const h = Math.min(EASE_HALF, 0.45 * (len / ((first.stride / first.cycle) * pace)))
  let best = Infinity, arg = 0
  for (const c of cands) {
    if (c.off > nearest + NEAR) continue
    let d = 0
    for (let tau = -h; tau <= h + 1e-9; tau += h / 6) d += poseDistance(first.loop(c.end + tau * pace, a), walk.loop(c.w + tau * pace, b))
    if (d < best - 1e-9) { best = d; arg = c.p }
  }
  return arg
}
