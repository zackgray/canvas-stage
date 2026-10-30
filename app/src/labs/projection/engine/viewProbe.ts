import { Quaternion, Vector3, type PerspectiveCamera } from 'three'
import type { Pose, Vec3 } from '../shoot/angle'
import { holeStats, type CamSpec, type Quat } from '../shoot/holes'
import { renderDepth } from './capture'
import { RestGate } from './restGate'
import type { Stage } from './Stage'

// Glue between the Stage and the pure shoot/ logic: camera poses, a cheap low-res hole probe, and a motion watch.

/** Long side of the hole probe render; small, it only needs a fraction. */
const PROBE_PX = 192

const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z]

export function cameraPose(cam: PerspectiveCamera): Pose {
  cam.updateMatrixWorld(true)
  return { position: v3(cam.getWorldPosition(new Vector3())), forward: v3(cam.getWorldDirection(new Vector3())) }
}

export const pivotOf = (stage: Stage): Vec3 => v3(stage.controls.target)

function spec(cam: PerspectiveCamera): CamSpec {
  const q = cam.getWorldQuaternion(new Quaternion())
  return { quaternion: [q.x, q.y, q.z, q.w] as Quat, vfovDeg: cam.fov, aspect: cam.aspect }
}

/** Non-sky hole fraction of the current view (settled layers included), from a small offscreen depth render. */
export function probeHoles(stage: Stage): number | null {
  const src = stage.source
  if (!src) return null
  const cam = stage.exportCamera()
  const aspect = cam.aspect
  const w = aspect >= 1 ? PROBE_PX : Math.max(8, Math.round(PROBE_PX * aspect))
  const h = aspect >= 1 ? Math.max(8, Math.round(PROBE_PX / aspect)) : PROBE_PX
  const depth = stage.offscreen(() => renderDepth(stage.renderer, stage.scene, cam, w, h))
  const s = holeStats(depth, w, h, spec(cam), spec(stage.projector),
    { depth: src.depth, width: src.depthWidth, height: src.depthHeight })
  return s.fraction
}

/** One frame of the motion watch: did the view move (pose or lens past the gate's tolerance, or `active`)? */
export function viewMoved(gate: RestGate, cam: PerspectiveCamera, active = false): boolean {
  const p = cam.position
  const q = cam.quaternion
  return gate.moved({ position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w], fov: cam.fov }, active)
}

/**
 * Calls `onMove` on every frame the view camera moved (orbit, damping, fly keys, snap buttons, the operator);
 * `active` reports a driver that is moving the camera right now, however slowly.
 */
export class MotionWatch {
  private frame = 0
  private gate = new RestGate()
  private cam: PerspectiveCamera
  private onMove: () => void
  private active: () => boolean

  constructor(cam: PerspectiveCamera, onMove: () => void, active: () => boolean = () => false) {
    this.cam = cam
    this.onMove = onMove
    this.active = active
    this.tick()
  }

  private tick = () => {
    this.frame = requestAnimationFrame(this.tick)
    if (viewMoved(this.gate, this.cam, this.active())) this.onMove()
  }

  dispose() {
    cancelAnimationFrame(this.frame)
  }
}
