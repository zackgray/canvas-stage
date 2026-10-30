/** Stage3D presets: the genre-neutral example plans (plans/), a walking example performance, and the E114 battlefield as a test fixture. */
import type { PerformancePlan, ScenePlan } from './contract.ts'
import { BATTLEFIELD_PLAN, NEW_PLANS } from './plans/index.ts'

/** the E114 battlefield (a fixture for tests and old worlds; it names its own pano sky). Not offered as a preset. */
export const BATTLEFIELD: ScenePlan = BATTLEFIELD_PLAN

/** a 4.5 m walk toward the master camera: a fixture for tests and walking examples. Never the default (a new world stands, store.ts). */
export const WALK_TOWARD: PerformancePlan = { path: [[0.6, -12.5], [0.6, -8.0]], pace: 0.8 }

/** the presets the set panel offers: open field by day, a country road at dusk, a desert at noon, a snowy dawn */
export const PLANS: Record<string, ScenePlan> = { ...NEW_PLANS }
