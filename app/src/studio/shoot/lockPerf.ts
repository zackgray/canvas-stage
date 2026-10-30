// What Lock take sends as the take's own walk (PLAN-PER-TAKE-PERFORMANCE.md §2, TakeLockPerf): the performance the stage's
// performer plays, exactly as the page holds it (the server re-parses and hashes it; a rebuilt copy could hash differently and
// read as another walk). Only with a 3D performer whose pack id it is; else nothing (the server then copies the scene's walk
// when it is still this one, as for an older page).
import type { TakeLockRequest } from '../../shared/shotContract'
import { isMocapPackId, type TakeLockPerf } from '../../shared/takePerfContract'
import type { PerformancePlan } from '../../stage3d/contract'
import { mocapPackId } from '../../stage3d/planHash'

export function lockPerfOf(q: Pick<TakeLockRequest, 'packId'>, perf: PerformancePlan | null | undefined): TakeLockPerf {
  return perf && isMocapPackId(q.packId) && mocapPackId(perf) === q.packId ? { perf } : {}
}
