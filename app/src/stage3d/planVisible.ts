// How much of a plan the master view sees (Track C, pure): the master camera stands at the origin looking toward -z with a 36 mm
// gate at KIT_MASTER_MM, so a piece is in view when it is ahead and inside the horizontal half-angle. Ground relief (mounds) is not
// a piece anyone is asked to see. Used by the planner's free density check (server/planner/finishPlan.ts).
import type { ScenePlan } from './contract.ts'

const HALF_TAN = 18 / 24 // tan(half the horizontal FOV): the master's 24 mm lens on a 36 mm-wide gate
const NEAR = 1.5, FAR = 150

/** the kit indices of the pieces in the master view (their centre; relief excluded) */
export function visibleInMaster(plan: Pick<ScenePlan, 'kit'>): number[] {
  const out: number[] = []
  plan.kit.forEach((it, i) => {
    if (it.kind === 'mound') return
    const ahead = -it.at[1]
    if (ahead >= NEAR && ahead <= FAR && Math.abs(it.at[0]) <= ahead * HALF_TAN) out.push(i)
  })
  return out
}

/** fewer pieces than this in the master view is a thin set (a warning, never a refusal) */
export const MIN_VISIBLE_PIECES = 6
