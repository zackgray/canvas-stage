import { useEffect } from 'react'
import { applyLevel } from '../engine/level'
import type { Stage } from '../engine/Stage'
import { fetchWorldScale, scaledLevel, setFloorOf } from '../engine/worldScaleFetch'
import type { WorldScale } from '../engine/worldScale'

/** Put a fetched world scale on the stage: the root scale + ground match, and the scaled level for the orbits and rigs. */
export function applyWorldScale(stage: Pick<Stage, 'setWorldScale' | 'projector' | 'view' | 'controls'>, ws: WorldScale | null) {
  stage.setWorldScale(ws?.s ?? 1, ws ? setFloorOf(ws) : null)
  applyLevel(stage, ws ? scaledLevel(ws, stage.projector) : null)
}

/**
 * Load the selected location's `level.json` and its world's camera height: scale the world to true metres (worldScale.ts)
 * and turn the stage's orbits about the level (none: the old +Y assumption, scale 1).
 */
export function useLevel(stage: Stage | null, sourceId: string | undefined) {
  useEffect(() => {
    if (!stage) return
    let cancelled = false
    applyWorldScale(stage, null)
    if (sourceId) {
      void fetchWorldScale(sourceId).then((ws) => { if (!cancelled) applyWorldScale(stage, ws) })
    }
    return () => { cancelled = true; applyWorldScale(stage, null) }
  }, [stage, sourceId])
}
