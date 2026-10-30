// Free/fly, dolly track and crane. Each keeps an operator "head" (pan/tilt) driven by the right
// stick / mouse, with the DualSense gyro layered on top as handheld aim.
import { Vector3 } from 'three'
import { clamp } from '../math/spring'
import type { Rig, RigContext, RigPose } from './types'
import { PITCH_LIMIT, forwardH, rightH } from './types'

/** Pan/tilt head shared by the simple rigs. */
export class Head {
  yaw = 0
  pitch = 0

  set(yaw: number, pitch: number) {
    this.yaw = yaw
    this.pitch = pitch
  }

  turn(ctx: RigContext) {
    this.yaw += ctx.aimDelta.yaw
    this.pitch = clamp(this.pitch + ctx.aimDelta.pitch, -PITCH_LIMIT, PITCH_LIMIT)
  }

  pose(position: Vector3, ctx: RigContext): RigPose {
    return {
      position: position.clone(),
      yaw: this.yaw + ctx.gyro.yaw,
      pitch: clamp(this.pitch + ctx.gyro.pitch, -PITCH_LIMIT, PITCH_LIMIT),
      roll: ctx.gyro.roll * 0.5,
    }
  }
}

const _f = new Vector3()
const _r = new Vector3()

export class FreeRig implements Rig {
  readonly id = 'free' as const
  readonly label = 'Free / fly'
  readonly hint = ['Left stick / WASD: move', 'D-pad / Q E: down, up', 'Right stick / mouse / gyro: aim']
  private pos = new Vector3()
  private head = new Head()
  speed = 4

  enter(from: RigPose) {
    this.pos.copy(from.position)
    this.head.set(from.yaw, from.pitch)
  }

  update(ctx: RigContext): RigPose {
    this.head.turn(ctx)
    const s = this.speed * ctx.speedScale * ctx.dt
    forwardH(this.head.yaw, _f).multiplyScalar(ctx.input.move.y * s)
    rightH(this.head.yaw, _r).multiplyScalar(ctx.input.move.x * s)
    this.pos.add(_f).add(_r)
    this.pos.y = Math.max(0.2, this.pos.y + ctx.input.lift * s)
    return this.head.pose(this.pos, ctx)
  }
}

/** A straight track laid along the direction the camera faced when the rig was chosen. */
export class DollyRig implements Rig {
  readonly id = 'dolly' as const
  readonly label = 'Dolly track'
  readonly hint = ['Left stick up/down / W S: push in, pull out along the track', 'Right stick / mouse / gyro: aim']
  private origin = new Vector3()
  private axis = new Vector3()
  private s = 0
  private head = new Head()
  speed = 1.5
  maxTravel = 15

  enter(from: RigPose) {
    this.origin.copy(from.position)
    forwardH(from.yaw, this.axis)
    this.s = 0
    this.head.set(from.yaw, from.pitch)
  }

  update(ctx: RigContext): RigPose {
    this.head.turn(ctx)
    this.s = clamp(this.s + ctx.input.move.y * this.speed * ctx.speedScale * ctx.dt, -this.maxTravel, this.maxTravel)
    const pos = this.origin.clone().addScaledVector(this.axis, this.s)
    return this.head.pose(pos, ctx)
  }
}

/** A boom on a pivot behind the camera: raise/lower on an arc, swing the arm (and head) to pan. */
export class CraneRig implements Rig {
  readonly id = 'crane' as const
  readonly label = 'Crane'
  readonly hint = ['Left stick up/down / W S: boom up, down', 'Left stick left/right / A D: swing arm (pans)', 'Right stick / mouse / gyro: head']
  private pivot = new Vector3()
  private arm = 5
  private elevation = 0
  private swing = 0
  private head = new Head()

  enter(from: RigPose) {
    this.swing = from.yaw
    this.elevation = 0
    this.pivot.copy(from.position).addScaledVector(forwardH(from.yaw, _f), -this.arm)
    this.head.set(from.yaw, from.pitch)
  }

  update(ctx: RigContext): RigPose {
    this.head.turn(ctx)
    const k = ctx.speedScale * ctx.dt
    this.elevation = clamp(this.elevation + ctx.input.move.y * 0.35 * k, -0.25, 1.1)
    const dSwing = -ctx.input.move.x * 0.3 * k
    this.swing += dSwing
    this.head.yaw += dSwing
    const horiz = this.arm * Math.cos(this.elevation)
    const pos = this.pivot.clone().addScaledVector(forwardH(this.swing, _f), horiz)
    pos.y = Math.max(0.2, this.pivot.y + this.arm * Math.sin(this.elevation))
    return this.head.pose(pos, ctx)
  }
}
