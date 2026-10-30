// The subject's mark (Track C, pure): where the hero starts in the set. A plan without one has the start of its flat corridor: the
// corridor's far end, 3.5 m in and 0.6 m right of its middle, which is where the default walk has begun since the first preset
// (WALK_TOWARD starts [0.6, -12.5] on the planner's corridor [-3, -16, 3, 8]; a plan with no corridor gets that point). The Set's top view moves it; Blocking's new path begins on it.
// A mark with no saved facing faces the nearest brief prop (a kit piece with a pieceTag, else one with a label); none, or one at the mark: +z as before.
import type { MarkPlan, ScenePlan } from './contract.ts'

type At = [number, number]

/** the brief's props on the set: the kit pieces with a pieceTag, else the ones with a label */
export function briefProps(kit: ScenePlan['kit'] | undefined): ScenePlan['kit'] {
  const tagged = (kit ?? []).filter((k) => k.pieceTag)
  return tagged.length ? tagged : (kit ?? []).filter((k) => k.label)
}

/** degrees (0 = +z, as the contract) from `from` toward `at`, or 0 when it is on the point */
export function yawToward(from: At, at: readonly [number, number]): number {
  if (Math.hypot(at[0] - from[0], at[1] - from[1]) < 0.05) return 0
  return Math.round(((Math.atan2(at[0] - from[0], at[1] - from[1]) * 180) / Math.PI) * 10) / 10
}

/** degrees (0 = +z, as the contract) from `from` toward the nearest brief prop, or 0 when there is none or it is on the point */
export function yawToNearestProp(from: At, kit: ScenePlan['kit'] | undefined): number {
  let best: At | null = null, bestD = Infinity
  for (const k of briefProps(kit)) { const d = Math.hypot(k.at[0] - from[0], k.at[1] - from[1]); if (d < bestD) { bestD = d; best = k.at } }
  return best ? yawToward(from, best) : 0
}

export const markOf = (plan: Pick<ScenePlan, 'flat'> & Partial<Pick<ScenePlan, 'mark' | 'kit'>>): Required<MarkPlan> => {
  if (plan.mark) {
    const at: At = [plan.mark.at[0], plan.mark.at[1]]
    return { at, yawDeg: plan.mark.yawDeg ?? yawToNearestProp(at, plan.kit) }
  }
  const at: At = !plan.flat ? [0.6, -12.5] : [Math.round(((plan.flat[0] + plan.flat[2]) / 2 + 0.6) * 100) / 100, plan.flat[1] + 3.5]
  return { at, yawDeg: yawToNearestProp(at, plan.kit) }
}
