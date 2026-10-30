/**
 * Evaluate a compiled timeline at time t: the owning segment's pose, crossfaded (per-bone slerp, root lerp) with its neighbour across
 * a window centred on each boundary, then the feet planted through each hand-off held where they stand (motion/footLock.ts), then a
 * swinging toe kept off the floor (motion/toeClear.ts). Pure in t: nothing accumulates between calls, so frames can be asked for in
 * any order.
 */
import type { Timeline } from './compile.ts'
import { footLock, type FootLock } from './footLock.ts'
import { segPose, smooth, type Anchor } from './segments.ts'
import { blendPose, copyPose, makePose, type Pose } from './skeleton.ts'
import { toeClear } from './toeClear.ts'
import { wrapAngle } from './path.ts'

const clampT = (tl: Timeline, t: number) => Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), tl.duration)

/** index of the segment owning time t */
export function segIndex(tl: Timeline, t: number): number {
  let lo = 0, hi = tl.segs.length - 1
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tl.segs[m].t0 <= t) lo = m; else hi = m - 1 }
  return lo
}

/** the neighbour to blend with at t and its weight (0 = all owner), or null */
function fade(tl: Timeline, i: number, t: number): { j: number; w: number } | null {
  const g = tl.segs[i]
  if (i > 0 && t < g.t0 + tl.xf[i] / 2) return { j: i - 1, w: 1 - smooth((t - (g.t0 - tl.xf[i] / 2)) / tl.xf[i]) }
  if (i < tl.segs.length - 1 && t > g.t1 - tl.xf[i + 1] / 2) return { j: i + 1, w: smooth((t - (g.t1 - tl.xf[i + 1] / 2)) / tl.xf[i + 1]) }
  return null
}

/** the segments playing at t with their blend weights (the owner first) */
function playing(tl: Timeline, t: number): { i: number; w: number }[] {
  const tc = clampT(tl, t), i = segIndex(tl, tc), f = fade(tl, i, tc)
  return f && f.w > 0 ? [{ i, w: 1 - f.w }, { i: f.j, w: f.w }] : [{ i, w: 1 }]
}

/** one foot lock per timeline, however many evaluators read it (it depends on the timeline alone) */
const locks = new WeakMap<Timeline, FootLock>()

export type Evaluator = { pose(t: number): Pose; anchor(t: number): Anchor; heading(t: number): number }

export function evaluator(tl: Timeline): Evaluator {
  const n = tl.lib.canon.names.length, a = makePose(n), b = makePose(n), out = makePose(n), prev = makePose(n)
  /** the crossfaded pose, feet as the segments place them */
  function blended(t: number, dst: Pose): Pose {
    const tc = clampT(tl, t), i = segIndex(tl, tc), f = fade(tl, i, tc)
    segPose(tl.segs[i], tc, a)
    if (!f || f.w <= 0) return copyPose(dst, a)
    segPose(tl.segs[f.j], tc, b)
    return blendPose(dst, a, b, f.w)
  }
  const lockOf = () => { // built on the first pose asked for (an anchor-only reader never pays for it)
    let lock = locks.get(tl)
    if (!lock) locks.set(tl, (lock = footLock(tl, blended, (u) => playing(tl, u))))
    return lock
  }
  const locked = (t: number, dst: Pose) => lockOf().apply(clampT(tl, t), blended(t, dst))
  const clear = toeClear(tl.lib.canon, locked, prev, (t, k) => lockOf().free(t, k))
  return {
    /** world pose: root xz absolute, root y = height above the ground */
    pose(t) { return clear(clampT(tl, t), locked(t, out)) },
    /** the smooth path point (no sway) */
    anchor(t) { const tc = clampT(tl, t); return tl.segs[segIndex(tl, tc)].anchor(tc) },
    /** intent heading yaw, blended across crossfades like the pose */
    heading(t) {
      const tc = clampT(tl, t), i = segIndex(tl, tc), f = fade(tl, i, tc), y = tl.segs[i].anchor(tc).yaw
      return f ? y + wrapAngle(tl.segs[f.j].anchor(tc).yaw - y) * f.w : y
    },
  }
}
