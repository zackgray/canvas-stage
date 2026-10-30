/**
 * The pose at a time, from the clip phase the timeline is in (2026-10-25): a still is drawn from ONE frame, so its words must say what
 * the body is doing at that frame ("bending over the hive, both hands empty"), never the whole action ("lifts a frame out of the
 * hive", which draws the frame in her hands at frame 0). A clip that carries phases (clips.ts ClipDef.phases) names its own pose by
 * clip time; a carried prop (ClipDef.prop) is in the hands between its grab and release. Pure.
 */
import type { ClipDef } from '../clips.ts'
import type { Timeline } from './compile.ts'
import type { Seg } from './segments.ts'
import { segIndex } from './timeline.ts'

/** the phase words of a clip at file time τ ('' when the clip carries none) */
export function phaseWords(def: ClipDef, τ: number): string {
  let words = ''
  for (const p of def.phases ?? []) if (τ >= p.from - 1e-9) words = p.words
  return words
}

/** the segment's clip carries its own pose words */
export const phased = (seg: Seg): boolean => !!seg.clip?.def.phases?.length && !!seg.tau

/** the timeline plays at least one action that names its own pose (a still of this take is told the pose, not the beat) */
export const hasPhases = (tl: Timeline): boolean => tl.segs.some(phased)

/** the pose words at performance time t, or '' when the segment there carries none (a walk, a stand, a look: the caller words those) */
export function poseWordsAt(tl: Timeline, t: number): string {
  const at = Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), tl.duration)
  const seg = tl.segs[segIndex(tl, at)]
  return phased(seg) ? phaseWords(seg.clip!.def, seg.tau!(at)) : ''
}

/** is the segment's prop in the hands at t (between grab and release, in clip time)? false for a segment that carries none */
export function holdsProp(seg: Seg, t: number): boolean {
  const p = seg.clip?.def.prop
  if (!p || !seg.tau) return false
  const τ = seg.tau(t)
  return (p.grab === undefined || τ >= p.grab) && (p.release === undefined || τ < p.release)
}
