// Partial orbit around a fixed target (the car's position when the rig was chosen, or a point
// ahead). The arc is capped: DEMO.md allows a slow partial orbit, never a 360.
import { Matrix4, Quaternion, Vector3 } from 'three'
import { FALLBACK_FLOOR, floorAlongUp, getActiveLevel, type Level } from '../../projection/engine/level'
import { clamp } from '../math/spring'
import type { Rig, RigContext, RigPose } from './types'
import { PITCH_LIMIT, forwardH, lookAngles, poseFromQuaternion } from './types'

export const ORBIT_ARC_LIMIT = (50 * Math.PI) / 180
const ORBIT_RATE = 0.3 // rad/s at full stick
const MIN_RADIUS = 0.5
const OFF_YAW = 0.5
const OFF_PITCH = 0.4
const ELEV_LIMIT = (80 * Math.PI) / 180
const Y = new Vector3(0, 1, 0)
const X = new Vector3(1, 0, 0)
const Z = new Vector3(0, 0, 1)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export class OrbitRig implements Rig {
  readonly id = 'orbit' as const
  readonly label = 'Orbit'
  readonly hint = [
    'Left stick left/right / A D: orbit (max ±50°)',
    'Left stick up/down / W S: radius',
    'Q E: height · C / R3: re-target (the car, or the stage pivot)',
    'Right stick / mouse / gyro: framing offset',
  ]
  readonly target = new Vector3()
  private startAngle = 0
  private angle = 0
  private radius = 8
  private height = 1.6
  private offYaw = 0
  private offPitch = 0
  /** the location's measured level (up, floor) the orbit turns about; null = +Y and the 0.2 m floor, as always */
  level: () => Level | null = getActiveLevel
  private readonly e1 = new Vector3(1, 0, 0)
  private readonly e2 = new Vector3(0, 0, 1)
  private up = Y.clone()
  private floor = FALLBACK_FLOOR

  /** Refresh the up axis, its two horizontal axes (with up = +Y: e1 = +x, e2 = +z) and the floor. */
  private frame(): Level | null {
    const lv = this.level()
    this.floor = floorAlongUp(lv)
    this.up.copy(lv?.up ?? Y)
    this.e2.set(0, 0, 1).addScaledVector(this.up, -this.up.z)
    if (this.e2.lengthSq() < 1e-6) this.e2.set(1, 0, 0).addScaledVector(this.up, -this.up.x)
    this.e2.normalize()
    this.e1.crossVectors(this.up, this.e2)
    return lv
  }

  enter(from: RigPose, ctx: RigContext) {
    const host = ctx.orbitTarget?.()
    if (host) {
      this.target.copy(host)
      // the camera stays exactly where it is, aim included (gyro is added on top each frame)
      return this.retarget(from.position, { yaw: from.yaw - ctx.gyro.yaw, pitch: from.pitch - ctx.gyro.pitch })
    }
    const toCar = ctx.carAim.distanceTo(from.position)
    if (toCar < 40) this.target.copy(ctx.carAim)
    else this.target.copy(from.position).addScaledVector(forwardH(from.yaw), 10).setY(0.8)
    this.retarget(from.position)
  }

  /**
   * Re-anchor on a new target, keeping the camera where it is: radius, angle and height come from the camera's
   * position relative to the target. With `aim`, the camera's current aim is kept too, as a framing offset (clamped to
   * the offset range), so re-anchoring does not swing the view; without, it looks straight at the target.
   */
  retarget(camPos: Vector3, aim?: { yaw: number; pitch: number }) {
    this.frame()
    const d = camPos.clone().sub(this.target)
    const dx = d.dot(this.e1)
    const dz = d.dot(this.e2)
    this.radius = Math.max(MIN_RADIUS, Math.hypot(dx, dz))
    this.angle = this.startAngle = Math.atan2(dx, dz)
    this.height = this.up.dot(camPos)
    this.offYaw = this.offPitch = 0
    if (!aim) return
    const look = lookAngles(camPos, this.target)
    this.offYaw = clamp(wrap(aim.yaw - look.yaw), -OFF_YAW, OFF_YAW)
    this.offPitch = clamp(aim.pitch - look.pitch, -OFF_PITCH, OFF_PITCH)
  }

  /**
   * Direct manipulation (a mouse drag on the stage): swing around the target by `dAngle` (within the arc cap) and up /
   * down by `dElev` at a constant distance from it (elevation held within ±80°, never below the floor).
   */
  drag(dAngle: number, dElev: number) {
    this.frame()
    this.angle = clamp(this.angle + dAngle, this.startAngle - ORBIT_ARC_LIMIT, this.startAngle + ORBIT_ARC_LIMIT)
    if (!dElev) return
    const t = this.up.dot(this.target)
    const dy = this.height - t
    const dist = Math.hypot(this.radius, dy)
    const elev = clamp(Math.atan2(dy, this.radius) + dElev, -ELEV_LIMIT, ELEV_LIMIT)
    this.radius = Math.max(MIN_RADIUS, dist * Math.cos(elev))
    this.height = Math.max(this.floor, t + dist * Math.sin(elev))
  }

  /** Dolly toward (factor < 1) or away from the target along the line to it (the wheel on the stage). */
  dolly(factor: number) {
    this.frame()
    const t = this.up.dot(this.target)
    const dy = this.height - t
    const dist = Math.hypot(this.radius, dy)
    const k = clamp(dist * factor, MIN_RADIUS, 60) / Math.max(dist, 1e-6)
    this.radius = Math.max(MIN_RADIUS, this.radius * k)
    this.height = Math.max(this.floor, t + dy * k)
  }

  update(ctx: RigContext): RigPose {
    const lv = this.frame()
    const k = ctx.speedScale * ctx.dt
    this.angle = clamp(
      this.angle + ctx.input.move.x * ORBIT_RATE * k,
      this.startAngle - ORBIT_ARC_LIMIT,
      this.startAngle + ORBIT_ARC_LIMIT,
    )
    this.radius = clamp(this.radius - ctx.input.move.y * 1.5 * k, Math.min(2, this.radius), 60)
    this.height = Math.max(this.floor, this.height + ctx.input.lift * 1.5 * k)
    this.offYaw = clamp(this.offYaw + ctx.aimDelta.yaw, -OFF_YAW, OFF_YAW)
    this.offPitch = clamp(this.offPitch + ctx.aimDelta.pitch, -OFF_PITCH, OFF_PITCH)

    const pos = this.target.clone().addScaledVector(this.up, -this.up.dot(this.target))
      .addScaledVector(this.e1, Math.sin(this.angle) * this.radius)
      .addScaledVector(this.e2, Math.cos(this.angle) * this.radius)
      .addScaledVector(this.up, this.height)
    if (lv) return this.levelPose(pos, ctx)
    const look = lookAngles(pos, this.target)
    return {
      position: pos,
      yaw: look.yaw + this.offYaw + ctx.gyro.yaw,
      pitch: clamp(look.pitch + this.offPitch + ctx.gyro.pitch, -PITCH_LIMIT, PITCH_LIMIT),
      roll: ctx.gyro.roll * 0.5,
    }
  }

  /** Aim at the target with the horizon level about the measured up (a plain yaw / pitch pose would tilt it). */
  private levelPose(pos: Vector3, ctx: RigContext): RigPose {
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(pos, this.target, this.up))
    q.premultiply(new Quaternion().setFromAxisAngle(this.up, this.offYaw + ctx.gyro.yaw))
    q.multiply(new Quaternion().setFromAxisAngle(X, this.offPitch + ctx.gyro.pitch))
    q.multiply(new Quaternion().setFromAxisAngle(Z, ctx.gyro.roll * 0.5))
    const pose = poseFromQuaternion(pos, q)
    pose.pitch = clamp(pose.pitch, -PITCH_LIMIT, PITCH_LIMIT)
    return pose
  }
}
