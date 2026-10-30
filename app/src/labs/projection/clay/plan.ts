// A take as it is locked (docs/wave-b-contract.md, T1) and the clay frames of a locked take (pure).
//
// Length: 8k+1 frames at 24 fps, the longest that fits in BOTH the take (its smoothed track's length) and the performance
// from the frame on the set at the take's start, capped at 161 (CLAY_MAX; planWarp's own 193 is a CrossView limit).
// Cameras: planWarp's (the take's smoothed camera at each frame's world time, the operator's vfov centre-cropped to 1920x1088).
// With no performance on the set there is no pack clock: the take alone sets the length and perfStart is the world frame.
import type { ProcessedTake } from '../../controller/take/processTake'
import { startKey, type ClayCamera, type TakeLockRequest, type TakeRecord } from '../../../shared/shotContract'
import type { PackTiming } from '../performance/frames'
import { fit8n1, planWarp, type WarpPlan } from '../performance/warpPlan'

export const CLAY_W = 1920
export const CLAY_H = 1088
export const CLAY_FPS = 24
export const CLAY_MAX = 193 // raised 161 -> 193 (8 s) for the owner's 2026-10-24 limits test; Render prices per frame

/** frames the take's own track covers at 24 fps (its first sample to its last) */
export function takeFrames(samples: { t: number }[]): number {
  if (!samples.length) return 0
  return Math.floor((samples[samples.length - 1].t - samples[0].t) * CLAY_FPS + 1e-6) + 1
}

/** the pack clock, or (no performance) one long enough for any take from its start */
const clockOf = (pack: PackTiming | null, timelineStart: number): PackTiming =>
  pack ?? { fps: CLAY_FPS, frames: Math.round(Math.max(0, timelineStart) * CLAY_FPS) + 100_000 }

export interface PlanInput { smoothed: ProcessedTake['smoothed']; timelineStart: number; viewAspect: number }

/** The clay plan of a take: 8k+1 frames, <= 161, inside the take and the pack. Throws when fewer than 9 fit. */
export function clayPlan(take: PlanInput, pack: PackTiming | null, frames?: number): WarpPlan {
  if (pack && pack.fps !== CLAY_FPS) throw new Error(`the performance is ${pack.fps} fps; the clay is ${CLAY_FPS} fps`)
  const cap = frames ?? fit8n1(takeFrames(take.smoothed), CLAY_MAX)
  if (!cap) throw new Error('the take is shorter than 9 frames (0.4 s): record a longer one')
  return planWarp({ smoothed: take.smoothed, timelineStart: take.timelineStart, viewAspect: take.viewAspect }, clockOf(pack, take.timelineStart), CLAY_W / CLAY_H, cap)
}

/** What the page sends to lock the in-memory take (the server stamps id, startKey and dates). */
export function lockRequest(take: ProcessedTake, pack: (PackTiming & { id: string }) | null, worldId: string, fallbackAspect: number): TakeLockRequest {
  const viewAspect = take.viewAspect ?? fallbackAspect
  const timelineStart = take.raw.timelineStart
  const plan = clayPlan({ smoothed: take.smoothed, timelineStart, viewAspect }, pack)
  return {
    worldId, packId: pack?.id ?? null, fps: 24, frames: plan.frames.length, samples: take.smoothed,
    focal: plan.frames[0].focal, viewAspect, perfStart: plan.sourceStart, timelineStart,
  }
}

/** The key a lock of this request would get, and its length: what "changed since lock" compares. */
export function lockKey(q: Pick<TakeLockRequest, 'samples' | 'focal' | 'perfStart' | 'frames'>): { startKey: string; frames: number } {
  return { startKey: startKey(q.samples[0], q.focal, q.perfStart), frames: q.frames }
}

/** The locked take's clay plan, replanned from the record (it must give the record's frame count). */
export function recordPlan(rec: TakeRecord, pack: PackTiming | null): WarpPlan {
  const timelineStart = rec.timelineStart ?? rec.perfStart / CLAY_FPS
  const plan = clayPlan({ smoothed: rec.samples, timelineStart, viewAspect: rec.viewAspect }, pack, rec.frames)
  if (plan.frames.length !== rec.frames) throw new Error(`the performance on the set gives ${plan.frames.length} frames; the take was locked with ${rec.frames}`)
  if (plan.sourceStart !== rec.perfStart) throw new Error(`the take was locked at performance frame ${rec.perfStart}, the plan starts at ${plan.sourceStart}`)
  return plan
}

/** Each frame's camera. */
export const clayCameras = (plan: WarpPlan): ClayCamera[] =>
  plan.frames.map((f) => ({
    i: f.i, t: f.t, position: f.position, quaternion: f.quaternion, focal: f.focal, vfovDeg: f.vfovDeg,
  }))
