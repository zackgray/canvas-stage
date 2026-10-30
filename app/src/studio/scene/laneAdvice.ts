// The walking lane is advice on the Set, never a rule: a piece may stand in it and save. The Set says so in plain words for the
// picked piece, and marks red only the pieces the SAVED hero path actually runs through (until a path crosses one, nothing is flagged).
import type { KitItem, PerformancePlan, ScenePlan } from '../../stage3d/contract'
import { inCorridor } from '../../stage3d/planRules'
import { liftSpots } from '../../stage3d/props/liftSpots'
import { footprintHits } from '../stage/panels/blocking/blockingMath'

/** the kit pieces the saved hero path runs through (the hive she lifts from is where the path is meant to end: not one of them) */
export function pathHits(plan: ScenePlan, perf: Pick<PerformancePlan, 'path'> & { actions?: PerformancePlan['actions'] }): number[] {
  const lifts = liftSpots(perf.path, perf.actions, plan.kit)
  return footprintHits(plan.kit, perf.path).filter((i) => !lifts.some((s) => s.piece === i))
}

/** the plain line under the Set's toolbar for the picked piece, or null when there is nothing to say */
export function laneLine(item: KitItem | null, index: number | null, plan: ScenePlan, hits: readonly number[]): string | null {
  if (!item || index === null) return null
  const name = item.label || item.kind
  if (hits.includes(index)) return `The path walks through this ${name}. Move it, or change the path in Blocking.`
  if (!item.walkThrough && inCorridor(item, plan.flat)) return `This ${name} is in the walking lane; move it if the subject needs to pass.`
  return null
}
