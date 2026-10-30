/**
 * (wave A, W0 shell; track S3 fills standPlan) The hero standing at the mark. A standing performance (contract PerformancePlan.stand)
 * saves its path as the mark plus a short stub along the mark's facing, so every reader that needs two points (the server's check,
 * the compiler) still has them; standPlan turns that saved shape into the plan the compiler plays (no walk, actions at the start,
 * an idle to close the take).
 */
import type { MarkPlan, PathAction, PerformancePlan } from '../contract.ts'

/** metres: the stub a standing hero's saved path runs along the mark's facing */
export const STAND_STUB_M = 0.2
/** seconds a stand with no actions lasts (track S3's idle; the shot length pads it further, motion/shotPad.ts) */
export const STAND_DEFAULT_S = 4

/** a standing hero's saved path: the mark, then STAND_STUB_M along its yaw (0 = facing +z, the contract's convention) */
export function standPath(mark: MarkPlan): [[number, number], [number, number]] {
  const [x, z] = mark.at, yaw = ((mark.yawDeg ?? 0) * Math.PI) / 180
  return [[x, z], [x + Math.sin(yaw) * STAND_STUB_M, z + Math.cos(yaw) * STAND_STUB_M]]
}

/** seconds of idle that settle a stand whose last action is a look, a stop or a turn (a kneel or lift hold is its own ending) */
const SETTLE_S = 1

/**
 * The plan the compiler plays for this performance. Returns `perf` itself (same object) when `stand` is not set, so walking
 * performances compile exactly as before. For `stand`: the path is the saved stub (its first two points: shorter than the
 * compiler's station group, so no leg is ever walked), every action is pinned to the start, and an idle closes the take:
 * STAND_DEFAULT_S with no actions, none after a closing kneel or lift (the hold is the ending: no stand-up or lower-down plays),
 * else a short settle. A stub with no action at all would be walked by the compiler, so the stand always has at least the idle.
 * `shotSeconds` and every other field ride through untouched (the shot pad stretches the stand afterwards).
 */
export function standPlan(perf: PerformancePlan): PerformancePlan {
  if (!perf.stand) return perf
  const path = perf.path.slice(0, 2)
  const mine: PathAction[] = (perf.actions ?? []).map((a) => ({ ...a, at: 0 }))
  const last = mine[mine.length - 1]
  const close: PathAction[] = !last ? [{ kind: 'idle', at: 0, seconds: STAND_DEFAULT_S }]
    : last.kind === 'kneel' || last.kind === 'lift' || last.kind === 'move' ? [] : [{ kind: 'idle', at: 0, seconds: SETTLE_S }]
  return { ...perf, path, actions: [...mine, ...close] }
}
