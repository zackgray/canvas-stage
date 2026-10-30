/**
 * An ExtraPlan as the PerformancePlan the motion compiler reads (in the clip's own metres: the caller scales the figure by `s`).
 * A walker keeps its path and its actions. A stander has no path to walk: a 0.2 m stub toward the point it faces (shorter than the
 * compiler's station group, so it never starts a leg), its actions at that one station, then a long idle that outlasts any take.
 */
import type { ExtraPlan, PathAction, PerformancePlan } from '../contract.ts'

/** seconds a standing extra's closing idle holds (a take is at most a few tens of seconds) */
export const STAND_HOLD_S = 600
const STUB_M = 0.2

export function extraMotionPlan(e: ExtraPlan, s: number, heroStart: [number, number]): PerformancePlan {
  const scale = (p: [number, number]): [number, number] => [p[0] / s, p[1] / s]
  if (!e.stand) {
    const actions = e.actions?.map((a) => ({ ...a, at: a.at / s }))
    return { path: e.path.map(scale), gait: e.gait, pace: 1, ...(actions?.length ? { actions } : {}) }
  }
  const [x, z] = scale(e.path[0] ?? [0, 0]), [fx, fz] = scale(e.face ?? heroStart)
  const d = Math.hypot(fx - x, fz - z), ux = d > 1e-6 ? (fx - x) / d : 0, uz = d > 1e-6 ? (fz - z) / d : 1
  const mine: PathAction[] = (e.actions ?? []).map((a) => ({ ...a, at: 0 }))
  return {
    path: [[x, z], [x + ux * STUB_M, z + uz * STUB_M]], gait: 'walk', pace: 1,
    actions: [...mine, { kind: 'idle', at: 0, seconds: STAND_HOLD_S }],
  }
}
