// What usePerformance needs of a kit world to offer the 3D performer: the built world (its ground) and the performance plan.
import type { PerformancePlan } from '../../../stage3d/contract'
import type { PackEntry } from '../performance/load'
import type { KitLayer } from './KitLayer'
import { MOCAP_FPS, MOCAP_LABEL, planHash } from './MocapLayer'

export interface KitPerformance { id: string | null; layer: KitLayer | null; perf: PerformancePlan | null; audition?: boolean }

/** The 3D performer as a Performance list entry (its id is the mocap pack id; frames are filled in once it is built), or null. */
export function kitPackEntry(kit: KitPerformance): PackEntry | null {
  if (!kit.id || !kit.perf) return null
  return { id: `mocap-${planHash(kit.perf)}`, label: MOCAP_LABEL, locationId: kit.id, frames: 0, fps: MOCAP_FPS }
}
