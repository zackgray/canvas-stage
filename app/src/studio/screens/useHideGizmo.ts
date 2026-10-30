import { useEffect } from 'react'
import { CameraHelper } from 'three'
import type { Stage } from '../../labs/projection/engine/Stage'

/**
 * Hide the projector gizmo (the camera-helper frustum lines) while filming in Operator: it distracts the operator and is
 * no part of any capture (captures strip it themselves). The gizmo is the scene's only CameraHelper; the engine's own hole-mask
 * toggle sets the same flag, so this re-applies the choice each frame-rate tick instead of fighting it once.
 */
export function useHideGizmo(stage: Stage | null, hide: boolean): void {
  useEffect(() => {
    if (!stage || !hide) return
    const gizmos: CameraHelper[] = []
    stage.scene.traverse((o) => { if (o instanceof CameraHelper) gizmos.push(o) })
    const was = gizmos.map((g) => g.visible)
    const apply = () => gizmos.forEach((g) => { g.visible = false })
    apply()
    const id = setInterval(apply, 250)
    return () => { clearInterval(id); gizmos.forEach((g, i) => { g.visible = was[i] }) }
  }, [stage, hide])
}
