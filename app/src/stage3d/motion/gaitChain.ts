/**
 * A leg's travel as gait stretches (2026-10-28, the walk stumble). The start and stop clips are walking clips, so a faster gait (the
 * run) dropped straight from 3.2 m/s into the stop clip's walk and lost three quarters of its speed in a sixth of a second: a
 * stumble at the end of every run. A gait other than the walk now eases through one walking cycle on its way out of a start and into
 * a stop: [walk], gait, [walk], each stretch phase-matched to the pose the one before it leaves. A leg too short to fit half a
 * stride of the gait between its walks is walked. Pure.
 */
import { poseDistance, type Clip } from './clip.ts'
import type { Seg } from './segments.ts'
import { makePose } from './skeleton.ts'

/** one travelling stretch of a leg: `clip` looped from `phase0` over `len` metres */
export type Stretch = { clip: Clip; len: number; phase0: number }

/** the clip's loop phase at the end of the stretch */
export const endPhase = (s: Stretch) => s.phase0 + (s.len / s.clip.stride) * s.clip.cycle

/** the u in [a, b) (1/60 steps) minimising f */
export function argmin(a: number, b: number, f: (u: number) => number): number {
  let best = Infinity, arg = a
  for (let u = a; u < b; u += 1 / 60) { const d = f(u); if (d < best) { best = d; arg = u } }
  return arg
}

/** the phase of `to` whose pose best matches `from` at phase u (on a 1/60 s grid, remembered per clip pair) */
export function phaseMatcher(joints: number): (from: Clip, u: number, to: Clip) => number {
  const memo = new Map<string, number>(), a = makePose(joints), b = makePose(joints)
  return (from, u, to) => {
    const w = ((u % from.cycle) + from.cycle) % from.cycle, key = `${from.id}>${to.id}@${Math.round(w * 60)}`
    let v = memo.get(key)
    if (v === undefined) { from.loop(w, a); v = argmin(0, to.cycle, (x) => poseDistance(to.loop(x, b), a)); memo.set(key, v) }
    return v
  }
}

/**
 * the stretches covering `travel` metres of gait `gait`: with a walk eased in (after a start) and / or out (before a stop) when the
 * gait is not the walk. `enter(clip)` is the first stretch's phase (matched to the start clip's last pose, or 0 mid-stride).
 */
export function stretches(gait: Clip, walk: Clip, travel: number, easeIn: boolean, easeOut: boolean,
  enter: (clip: Clip) => number, match: (from: Clip, u: number, to: Clip) => number): Stretch[] {
  const bIn = easeIn ? walk.stride : 0, bOut = easeOut ? walk.stride : 0
  if (gait === walk || !(bIn || bOut)) return [{ clip: gait, len: travel, phase0: enter(gait) }]
  if (travel - bIn - bOut < gait.stride / 2) return [{ clip: walk, len: travel, phase0: enter(walk) }]
  const out: Stretch[] = []
  const push = (clip: Clip, len: number) => {
    const prev = out[out.length - 1]
    out.push({ clip, len, phase0: prev ? match(prev.clip, endPhase(prev), clip) : enter(clip) })
  }
  if (bIn) push(walk, bIn)
  push(gait, travel - bIn - bOut)
  if (bOut) push(walk, bOut)
  return out
}

/**
 * two travel segments of different speed meeting at a.t1, crossfaded over `x` seconds: through the window both anchors follow one
 * path distance whose speed eases from a's to b's on the crossfade's own smoothstep. Blending two anchors that each keep their own
 * speed sags the body below the slower gait's speed just after the seam (a run into its walk: 0.8 m/s against the walk's 1.3); the
 * eased distance meets each segment's own at the window's edges (the smoothstep is symmetric), so nothing outside it moves.
 */
export function easeSpeeds(a: Seg, b: Seg, x: number): void {
  const da = a.dist, db = b.dist
  if (!da || !db || !(x > 0)) return
  const tb = a.t1, va = da(tb + 1) - da(tb), vb = db(tb + 1) - db(tb), lo = tb - x / 2
  const I = (k: number) => { const c = Math.min(Math.max(k, 0), 1); return c * c * c - (c * c * c * c) / 2 } // ∫ smoothstep
  const eased = (t: number) => da(t) - (va - vb) * x * I((t - lo) / x)
  a.dist = (t) => (t > lo ? eased(t) : da(t))
  b.dist = (t) => (t < tb + x / 2 ? eased(t) : db(t))
}
