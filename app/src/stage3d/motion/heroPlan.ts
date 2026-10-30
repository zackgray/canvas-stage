/**
 * (wave A, W0) The single entry for the hero's motion: the browser performer (stage3d/performer.ts) and the server's still words
 * (server/hero/stillAction.ts) both compile the hero through here, so a stand (standPlan) and the shot length (padToShot) reach
 * the clay, the take lock and the still alike. Extras keep compile(extraMotionPlan(...)).
 * A performance with neither `stand` nor `shotSeconds` compiles exactly as compile(perf, lib) does.
 */
import type { PerformancePlan } from '../contract.ts'
import { compile, type Timeline } from './compile.ts'
import type { Library } from './library.ts'
import { padToShot } from './shotPad.ts'
import { standPlan } from './standPlan.ts'

export function heroTimeline(perf: PerformancePlan, lib: Library): Timeline {
  const plan = standPlan(perf)
  return padToShot(compile(plan, lib), plan, lib)
}
