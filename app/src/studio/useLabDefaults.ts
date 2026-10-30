import { useEffect, useRef } from 'react'
import { findLocation } from '../labs/projection/location/select'
import { NO_SET } from '../labs/projection/ui/settings'
import type { ProjectionLabState } from '../labs/projection/useProjectionLab'

/**
 * The studio's two automatic choices: the stage shows the current scene's set (its current world, libraryContract.ts), and the
 * Operator camera comes on when a performance is loaded. `sceneWorld`: the scene's current world, null when it has none yet (the
 * stage then shows no set: nothing of another scene's world, master or takes leaks in, m11), undefined while the scene loads.
 * The set follows the scene only when the scene's world changes (a scene opened, a set picked from its list, a build read back),
 * never against a world the lab just landed on itself (a build lands before the scene is read again).
 */
export function useLabDefaults(lab: ProjectionLabState, sceneWorld?: string | null): void {
  const { shots, pickSource, op, performance } = lab
  const source = lab.s.source
  const applied = useRef<string | null | undefined>(undefined)
  const blanked = useRef<string | null>(null)
  useEffect(() => {
    if (sceneWorld === undefined || !shots || applied.current === sceneWorld) return
    const shot = sceneWorld ? findLocation(shots, sceneWorld) : null
    if (sceneWorld && !shot) {
      // its master view is not listed yet (the manifest poll brings it): meanwhile no set, never the last scene's (m-10). Once per
      // world, so a build that lands on its own new world before the scene is read again is not pulled off it
      if (blanked.current !== sceneWorld) { blanked.current = sceneWorld; applied.current = undefined; if (source !== NO_SET) pickSource(NO_SET) }
      return
    }
    applied.current = sceneWorld
    blanked.current = null
    const want = shot?.id ?? NO_SET
    if (source !== want) pickSource(want)
  }, [sceneWorld, shots, source, pickSource])

  const operated = useRef<string | null>(null)
  const packId = performance.layer?.pack.id ?? null
  useEffect(() => {
    if (!packId || operated.current === packId) return
    operated.current = packId
    if (op.mode !== 'operator') op.setMode('operator')
  }, [packId, op])
}
