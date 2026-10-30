// Shared rig contract. A rig turns the normalised input into a camera pose; it drives only its own
// one or two axes, so a take made on a rig is one move by construction.
import { Euler, Quaternion, Vector3 } from 'three'
import type { GyroAngles, InputState, RigId } from '../input/types'
import type { CarState } from '../scene/carPath'

/** Camera pose as operator angles. Euler order YXZ; yaw 0 looks down -Z (three.js). */
export interface RigPose {
  position: Vector3
  yaw: number
  pitch: number
  roll: number
}

export type FollowMode = 'pan' | 'chase'

export interface RigContext {
  dt: number
  input: InputState
  /** Aim change this frame (radians) from right stick + mouse, already scaled to the lens. */
  aimDelta: { yaw: number; pitch: number }
  /** Gyro orientation offset (radians); zeros without a DualSense. */
  gyro: GyroAngles
  /** 1 normally, smaller while the precision modifier is held. */
  speedScale: number
  car: CarState
  /** The point on the car an operator frames. */
  carAim: Vector3
  hfov: number
  vfov: number
  followMode: FollowMode
  /** Host-supplied orbit centre (the stage's pivot on a set without a car); the car when absent or null. Read only on enter. */
  orbitTarget?: () => Vector3 | null
}

export interface Rig {
  readonly id: RigId
  readonly label: string
  /** One line per control, shown in the overlay. */
  readonly hint: string[]
  enter(from: RigPose, ctx: RigContext): void
  update(ctx: RigContext): RigPose
}

export const PITCH_LIMIT = (85 * Math.PI) / 180

/** Horizontal forward for a yaw (three.js: yaw 0 faces -Z). */
export function forwardH(yaw: number, out = new Vector3()): Vector3 {
  return out.set(-Math.sin(yaw), 0, -Math.cos(yaw))
}

export function rightH(yaw: number, out = new Vector3()): Vector3 {
  return out.set(Math.cos(yaw), 0, -Math.sin(yaw))
}

const _e = new Euler(0, 0, 0, 'YXZ')
export function poseQuaternion(p: RigPose, out = new Quaternion()): Quaternion {
  _e.set(p.pitch, p.yaw, p.roll, 'YXZ')
  return out.setFromEuler(_e)
}

export function poseFromQuaternion(position: Vector3, q: Quaternion): RigPose {
  _e.setFromQuaternion(q, 'YXZ')
  return { position: position.clone(), yaw: _e.y, pitch: _e.x, roll: _e.z }
}

export function clonePose(p: RigPose): RigPose {
  return { position: p.position.clone(), yaw: p.yaw, pitch: p.pitch, roll: p.roll }
}

/** Yaw/pitch that look from `from` toward `to`. */
export function lookAngles(from: Vector3, to: Vector3): { yaw: number; pitch: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}
