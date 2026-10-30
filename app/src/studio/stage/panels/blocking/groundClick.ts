// Blocking on the 3D view (QA 2026-10-25: "click the ground" only worked on the small top-view map). A click on the stage canvas
// (not a drag: the orbit camera keeps its drags) is cast onto the kit world's ground and handed to Blocking as a top-view point.
import { useEffect, useRef } from 'react'
import { Raycaster, Vector3, type Vector2 } from 'three'
import type { Stage } from '../../../../labs/projection/engine/Stage'
import { onPlainClick } from '../../../../labs/projection/engine/plainClick'
import type { Pt } from './blockingMath'

/**
 * Where a ray meets the ground height field (metres; [x, z] as the top view and the plan use), or null when it never comes down
 * (the sky) or lands too far off to be a place on the set. A few steps settle it on the terrain's height under the hit.
 */
export function groundHit(origin: Vector3, dir: Vector3, groundAt: (x: number, z: number) => number, maxM = 400): Pt | null {
  if (dir.y >= -1e-4) return null
  let h = groundAt(origin.x, origin.z)
  let p = origin.clone()
  for (let i = 0; i < 6; i++) {
    const t = (h - origin.y) / dir.y
    if (t <= 0) return null
    p = origin.clone().addScaledVector(dir, t)
    h = groundAt(p.x, p.z)
  }
  return Math.hypot(p.x - origin.x, p.z - origin.z) > maxM ? null : [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100]
}

/** While mounted (Blocking is the camera mode), a click on the 3D ground calls `onPoint`; off a kit world nothing is attached. */
export function useGroundClick(stage: Stage | null | undefined, onPoint: (p: Pt) => void): void {
  const cb = useRef(onPoint)
  useEffect(() => { cb.current = onPoint })
  useEffect(() => {
    const kit = stage?.kit
    if (!stage || !kit) return
    const ray = new Raycaster()
    return onPlainClick(stage.renderer.domElement, () => !!stage.kit, (ndc: Vector2) => {
      // the ray goes through the pane under the click (step 5's panes): a ground click maps as the user sees it in
      // every pane. A stage without panes (a test's fake) keeps the view camera's full-canvas ray.
      const r = stage.renderer.domElement.getBoundingClientRect()
      if (stage.panes) {
        const cast = stage.panes.rayAt(r.left + ((ndc.x + 1) / 2) * r.width, r.top + ((1 - ndc.y) / 2) * r.height)
        ray.ray.origin.copy(cast.ray.origin)
        ray.ray.direction.copy(cast.ray.direction)
      } else {
        ray.setFromCamera(ndc, stage.view)
      }
      const p = groundHit(ray.ray.origin, ray.ray.direction, stage.kit!.groundAt)
      if (p) cb.current(p)
    })
  }, [stage, stage?.kit])
}
