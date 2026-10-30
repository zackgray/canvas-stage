// The mark is the walk's first point (wave A, S4). The set approval key hashes the whole plan, mark included, so a start that could
// differ from the mark would un-approve the set on every Blocking save: the start is therefore always the mark, snapped here when a
// performance is written (never when it is read, so old saved performances load as they were). The plan is never written from here.
import { markOf } from '../../src/stage3d/mark.ts'
import type { PerformancePlan, ScenePlan } from '../../src/stage3d/contract.ts'
import { standPath } from '../../src/stage3d/motion/standPlan.ts'

/** the performance with its path starting on the plan's mark; a standing hero's stub is rebuilt from the mark. Same object when nothing moves. */
export function snapToMark<P extends PerformancePlan>(perf: P, plan: Pick<ScenePlan, 'flat'> & Partial<Pick<ScenePlan, 'mark' | 'kit'>>): P {
  const mark = markOf(plan)
  if (perf.stand) {
    const path = standPath(mark)
    return JSON.stringify(path) === JSON.stringify(perf.path) ? perf : { ...perf, path }
  }
  const first = perf.path[0]
  if (first && first[0] === mark.at[0] && first[1] === mark.at[1]) return perf
  return { ...perf, path: [[mark.at[0], mark.at[1]], ...perf.path.slice(1)] }
}
