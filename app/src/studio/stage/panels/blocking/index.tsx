import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { Stage } from '../../../../labs/projection/engine/Stage'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import { BlockingView } from './BlockingView'
import { useBlocking } from './useBlocking'
import './blocking.css'

/**
 * Shoot's Blocking mode (docs/preproduction-plan-fable.md §3.2, track E1): the top-down set view with the hero's path, actions on
 * its points, extras on their own paths and who plays each body, saved (free) to the kit world's performance.json. Track F mounts
 * `BlockingPanel` by this name from this index only, and suspends the operator keys while it shows. Clicks in the top view stop
 * here; key presses inside the panel are not passed up either. Off a kit world it says so and does nothing.
 */
export function BlockingPanel({ lab }: { lab: ProjectionLabState }) {
  const world = lab.kit.world
  if (!world) {
    return <p className="st-field-hint" data-testid="blocking-none">{lab.kit.error ?? (lab.kit.id ? 'Loading the set…' : 'Blocking works on a kit world: pick one as the source.')}</p>
  }
  // one draft per world: a new world (or another source) starts fresh from its saved performance
  return <BlockingBody key={world.id} world={world} stage={lab.stage} />
}

function BlockingBody({ world, stage }: { world: KitWorld; stage?: Stage | null }) {
  const b = useBlocking(world)
  return <BlockingView world={world} stage={stage} b={b} />
}
