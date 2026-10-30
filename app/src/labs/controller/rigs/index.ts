import type { RigId } from '../input/types'
import { CraneRig, DollyRig, FreeRig } from './basicRigs'
import { FollowRig } from './followRig'
import { OrbitRig } from './orbitRig'
import type { Rig } from './types'

export function createRigs(): Record<RigId, Rig> {
  return {
    free: new FreeRig(),
    dolly: new DollyRig(),
    crane: new CraneRig(),
    orbit: new OrbitRig(),
    follow: new FollowRig(),
  }
}

export { FollowRig, OrbitRig }
export type { Rig }
