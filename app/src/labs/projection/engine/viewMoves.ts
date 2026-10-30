// Moves of the view camera that involve OrbitControls: snap to projector, the orbit buttons, and handing the camera back
// to orbit after another driver (the operator) had it.
import { Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { depthRange } from '../math/depth'

/** Put the view where the projector is, with its lens, orbiting a point at the set's typical depth (times the world root scale). */
export function snapView(view: PerspectiveCamera, projector: PerspectiveCamera, controls: OrbitControls, depth: Float32Array | null, scale = 1) {
  view.position.copy(projector.position)
  view.quaternion.copy(projector.quaternion)
  view.fov = projector.fov
  view.updateProjectionMatrix()
  controls.target.copy(projector.position).addScaledVector(projector.getWorldDirection(new Vector3()), typicalDepth(depth) * scale)
  controls.update()
}

/** Geometric mean of the set's depth range: a pivot distance when no surface is under the frame centre. */
export function typicalDepth(depth: Float32Array | null): number {
  const range = depth ? depthRange(depth) : { min: 4, max: 4 }
  return Number.isFinite(range.min) ? Math.sqrt(range.min * range.max) : 4
}

/** Orbit target straight ahead of the view at the set's typical depth (times the root scale); the camera does not move. */
export function aimAhead(view: PerspectiveCamera, controls: OrbitControls, depth: Float32Array | null, scale = 1) {
  view.updateMatrixWorld(true)
  controls.target.copy(view.position).addScaledVector(view.getWorldDirection(new Vector3()), typicalDepth(depth) * scale)
  controls.update()
}

/** Swing the view around the orbit target by yaw/pitch degrees (about the view's up: +Y, or the location's fitted up). */
export function orbitAround(view: PerspectiveCamera, controls: OrbitControls, yawDeg: number, pitchDeg: number) {
  const offset = view.position.clone().sub(controls.target)
  offset.applyAxisAngle(view.up, (yawDeg * Math.PI) / 180)
  const right = new Vector3().crossVectors(offset, view.up).normalize()
  offset.applyAxisAngle(right, (pitchDeg * Math.PI) / 180)
  view.position.copy(controls.target).add(offset)
  view.lookAt(controls.target)
  controls.update()
}

/**
 * Give the view back to OrbitControls exactly where it is: spend any damping momentum left from before the
 * hand-off, then put the target straight ahead (on the surface when `centre` finds one, else at the old target
 * distance) so orbiting resumes around what the camera looks at. Camera roll, if any, is levelled.
 */
export function resumeOrbit(view: PerspectiveCamera, controls: OrbitControls, centre: () => boolean) {
  const position = view.position.clone()
  const quaternion = view.quaternion.clone()
  const dist = Math.min(50, Math.max(0.5, position.distanceTo(controls.target)))
  const damping = controls.enableDamping
  controls.enableDamping = false
  controls.update() // applies and clears leftover rotate/pan deltas
  view.position.copy(position)
  view.quaternion.copy(quaternion)
  view.updateMatrixWorld(true)
  controls.target.copy(position).addScaledVector(view.getWorldDirection(new Vector3()), dist)
  controls.update()
  centre()
  controls.enableDamping = damping
}
