/**
 * (wave A, track S7) The shot's one length (contract PerformancePlan.shotSeconds). A render keeps at most 8 s (193 frames at 24 fps),
 * and the take lock fits 8k+1 frames inside the pack, so a motion of exactly 8.0 s locks only 185: the pad reaches shot + 1/24 s so
 * the lock keeps shot·24 + 1 frames (193 for 8 s). The pack is ceil(duration·24) frames (MocapLayer), so the window below gives 193
 * or 194 pack frames for an 8 s shot.
 */
import type { PathAction, PerformancePlan } from '../contract.ts'
import { compile, type Timeline } from './compile.ts'
import type { Library } from './library.ts'

/** the pad's floor past the shot (one frame), and the window it lands in: [shot + PAD, shot + PAD + PAD/2] */
export const SHOT_PAD_S = 1 / 24
const WINDOW_S = 1 / 48

/** the action whose length is the take's ending: a kneel, lift or made-move hold, or an idle (stop, idle, look) closing the take */
const HOLD_SEG: Record<string, PathAction['kind']> = { 'kneel-hold': 'kneel', 'lift-hold': 'lift', 'move-hold': 'move', idle: 'idle', look: 'look', stop: 'stop' }
/** seconds the compiler plays for an action's `seconds` (compile.ts: holds default 2, at least 0.3; idles 1 / 2 / 2.5, at least 0.2) */
const played = (a: PathAction) => a.kind === 'kneel' || a.kind === 'lift' || a.kind === 'move'
  ? Math.max(a.seconds ?? 2, 0.3)
  : Math.max(a.seconds ?? (a.kind === 'stop' ? 1 : a.kind === 'idle' ? 2 : 2.5), 0.2)

const pathLength = (p: [number, number][]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0)

/** the index (in plan.actions) of the action that ends the take by holding, or -1 (the take ends walking, turning or standing up) */
export function endingAction(tl: Timeline, plan: PerformancePlan): number {
  const last = tl.segs[tl.segs.length - 1], acts = plan.actions ?? []
  // a progress 'stop' (the stop clip of a walk) moves; an idle 'stop' action is pinned (decay Infinity)
  if (!last || !acts.length || !HOLD_SEG[last.kind] || (last.decay !== Infinity)) return -1
  const len = pathLength(plan.path), clamp = (v: number) => Math.min(Math.max(v, 0), len)
  // the compiler's order: by where on the path, then by list order; the take ends on the last one
  const order = acts.map((_, i) => i).sort((x, y) => clamp(acts[x].at) - clamp(acts[y].at) || x - y)
  const i = order[order.length - 1]
  return acts[i].kind === HOLD_SEG[last.kind] ? i : -1
}

/**
 * The hero's timeline stretched to the shot length. `tl` is compile(plan, lib); `plan` is the plan that was compiled (after
 * standPlan), carrying `shotSeconds`; `lib` lets the pad recompile with a longer hold or a closing idle.
 * No `shotSeconds`: `tl` itself (same object), so performances with no saved length keep their exact duration, frames and locked
 * takes. Motion already at least shot + 1/24 s: `tl` itself (the shot line says to shorten it). Otherwise the last kneel or lift
 * hold (or closing idle) plays longer, else an idle is added at the path's end (she stops and stands), recompiling until the
 * duration lands in [shot + 1/24, shot + 1/24 + 1/48]. When the stop clip itself carries the take past that window (a walk ending
 * just short of the shot), the shortest idle is kept: a little over is harmless (the lock is the take's own length then).
 */
export function padToShot(tl: Timeline, plan: PerformancePlan, lib: Library): Timeline {
  const shot = plan.shotSeconds
  if (shot === undefined) return tl
  const lo = shot + SHOT_PAD_S, hi = lo + WINDOW_S, aim = lo + WINDOW_S / 2
  if (tl.duration >= lo) return tl
  const acts = plan.actions ?? []
  let at = endingAction(tl, plan), seconds: number, base: PathAction[]
  if (at >= 0) { base = acts; seconds = played(acts[at]) + (aim - tl.duration) }
  else { base = [...acts, { kind: 'idle', at: pathLength(plan.path), seconds: 1 }]; at = base.length - 1; seconds = 1 }
  const withSeconds = (s: number): PerformancePlan => ({ ...plan, actions: base.map((a, i) => (i === at ? { ...a, seconds: s } : a)) })
  let out = compile(withSeconds(seconds), lib)
  // the held or idle segment lasts exactly its seconds, so one correction lands; the loop only guards the arithmetic
  for (let k = 0; k < 4 && (out.duration < lo || out.duration > hi); k++) {
    const next = Math.max(seconds + (aim - out.duration), 0.3)
    if (Math.abs(next - seconds) < 1e-9) break
    seconds = next
    out = compile(withSeconds(seconds), lib)
  }
  return out
}
