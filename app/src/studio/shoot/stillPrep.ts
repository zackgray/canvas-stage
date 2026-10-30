import { useEffect } from 'react'
import type { PackTiming } from '../../labs/projection/performance/frames'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { ClayExport, TakeRecord } from '../../shared/shotContract'
import { depthReady, useClayExport } from './takeClay'
import { bringTake } from './takeShow'

/** Said under Draw this frame while the frames are not prepared yet: the press prepares them first, free. */
export const PREP_FIRST = 'The 3D set frames are prepared first (free, on this machine), then the still is drawn.'
/** Said when the prepare step ran but gave no depth: nothing was sent to Cloud. */
export const PREP_FAILED = "The frames couldn't be prepared, so nothing was drawn or billed. Press Draw the first frame again to retry."

type Pack = (PackTiming & { id: string }) | null
/** the performer the stage plays as of now (not this render's: the take's walk may have come on since) */
const packOn = (lab: ProjectionLabState, fallback: Pack): Pack => {
  const world = (lab.stage as { world?: { performance?: { pack?: PackTiming & { id: string } } | null } } | null)?.world
  return world ? world.performance?.pack ?? null : fallback
}

/**
 * A kit still is drawn on the clay's per-frame depth, so the frames must exist before the paid draw: `ensure` puts the take's own
 * walk and set on the stage and waits for its performer and its world (takeShow.ts bringTake: the opening capture and the frames
 * are of that walk on that set),
 * then prepares the frames (free, browser-side, shared with the lock block's Prepare button) and says whether the depth is there
 * now. It never lets the press reach the server without it. `prepare` stands in for the export in tests. Off a kit world
 * everything is ready.
 */
export function useStillPrep(lab: ProjectionLabState, take: TakeRecord | null, kit: boolean, onReady: () => void, prepare?: () => Promise<ClayExport | null>) {
  const pack = lab.performance?.layer?.pack ?? null
  const clay = useClayExport(kit ? lab.stage : null, kit ? take : null, pack, lab.s?.source ?? '')
  const ready = !kit || depthReady(clay.clay, take)
  // the frames exist now (prepared here, by the lock block, or found on disk): an old "export the clay first" warning goes
  useEffect(() => { if (kit && ready) onReady() }, [kit, ready]) // eslint-disable-line react-hooks/exhaustive-deps
  const ensure = async (): Promise<boolean> => {
    if (kit && take && !(await bringTake(lab.stage, take))) return false
    if (ready) return true
    return depthReady(prepare ? await prepare() : await clay.run(packOn(lab, pack)), take)
  }
  // why the frames cannot be prepared from here right now (the press is then off, with this reason)
  const blocked = kit && !ready && !prepare && !clay.running ? clay.blocked : null
  return { ready, blocked, ensure, running: clay.running, line: clay.line, error: clay.error, clay: clay.clay }
}
