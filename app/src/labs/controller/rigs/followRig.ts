// FOLLOW: keep the moving car framed like a human operator would.
// - pan: camera planted, turns to follow. chase: camera trails the car on a spring.
// - Spring lag on the aim (it catches up, it doesn't snap).
// - Left stick = framing offset (where the car sits in frame); release and it eases back to centre.
// - Right stick / mouse / gyro = small extra pan that also eases back when released.
import { Vector3 } from 'three'
import { solveFramingAim } from '../math/framing'
import type { Damped } from '../math/spring'
import { clamp, expAlpha, smoothDamp, smoothDampAngle } from '../math/spring'
import type { Rig, RigContext, RigPose } from './types'
import { PITCH_LIMIT } from './types'

export const FRAMING_RANGE = { u: 0.6, v: 0.5 }
export const GYRO_PAN_LIMIT = (8 * Math.PI) / 180

export interface FollowTuning {
  /** Aim spring smooth time (s). Bigger = lazier operator. */
  aimLag: number
  /** How fast the framing offset follows the stick (s). */
  framingLag: number
  /** Chase position spring (s). */
  chaseLag: number
  /** Chase offset in the car's frame: x = right, y = up, z = behind. */
  chaseOffset: Vector3
}

export const DEFAULT_FOLLOW: FollowTuning = {
  aimLag: 0.22,
  framingLag: 0.3,
  chaseLag: 0.5,
  chaseOffset: new Vector3(2.5, 1.7, 8),
}

const zero = (): Damped => ({ value: 0, velocity: 0 })

export class FollowRig implements Rig {
  readonly id = 'follow' as const
  readonly label = 'Follow the car'
  readonly hint = [
    'Left stick / WASD: where the car sits in frame (release = recentre)',
    'Triggers / Z X / wheel: zoom',
    'Right stick / mouse / gyro: small pan offset',
    'Circle / V: pan from fixed position <-> chase',
  ]
  tuning: FollowTuning = { ...DEFAULT_FOLLOW, chaseOffset: DEFAULT_FOLLOW.chaseOffset.clone() }
  readonly position = new Vector3()
  private px = zero()
  private py = zero()
  private pz = zero()
  private yaw = zero()
  private pitch = zero()
  private u = zero()
  private v = zero()
  private manualYaw = 0
  private manualPitch = 0

  enter(from: RigPose) {
    this.position.copy(from.position)
    this.px = { value: from.position.x, velocity: 0 }
    this.py = { value: from.position.y, velocity: 0 }
    this.pz = { value: from.position.z, velocity: 0 }
    this.yaw = { value: from.yaw, velocity: 0 }
    this.pitch = { value: from.pitch, velocity: 0 }
    this.u = zero()
    this.v = zero()
    this.manualYaw = this.manualPitch = 0
  }

  /** Current framing offset in NDC (where the car is being held in frame). */
  get framing(): { u: number; v: number } {
    return { u: this.u.value, v: this.v.value }
  }

  update(ctx: RigContext): RigPose {
    const { dt, input } = ctx
    const t = this.tuning

    if (ctx.followMode === 'chase') {
      const h = ctx.car.heading
      const o = t.chaseOffset
      // Car forward is (sin h, 0, cos h); right is (-cos h, 0, sin h) for a car facing +Z at h=0.
      const fx = Math.sin(h)
      const fz = Math.cos(h)
      const want = new Vector3(
        ctx.car.position.x - fx * o.z - fz * o.x,
        ctx.car.position.y + o.y,
        ctx.car.position.z - fz * o.z + fx * o.x,
      )
      this.px = smoothDamp(this.px, want.x, t.chaseLag, dt)
      this.py = smoothDamp(this.py, want.y, t.chaseLag, dt)
      this.pz = smoothDamp(this.pz, want.z, t.chaseLag, dt)
      this.position.set(this.px.value, this.py.value, this.pz.value)
    } else {
      this.px = { value: this.position.x, velocity: 0 }
      this.py = { value: this.position.y, velocity: 0 }
      this.pz = { value: this.position.z, velocity: 0 }
    }

    // Framing offset follows the stick; with the stick released it returns to centre.
    this.u = smoothDamp(this.u, input.move.x * FRAMING_RANGE.u, t.framingLag, dt)
    this.v = smoothDamp(this.v, input.move.y * FRAMING_RANGE.v, t.framingLag, dt)

    const want = solveFramingAim(this.position, ctx.carAim, this.u.value, this.v.value, ctx.hfov, ctx.vfov)
    this.yaw = smoothDampAngle(this.yaw, want.yaw, t.aimLag, dt)
    this.pitch = smoothDamp(this.pitch, want.pitch, t.aimLag, dt)

    // Manual pan offset: accumulates while pushed, decays back to tracking when released.
    const pushing = ctx.aimDelta.yaw !== 0 || ctx.aimDelta.pitch !== 0
    this.manualYaw = clamp(this.manualYaw + ctx.aimDelta.yaw, -0.3, 0.3)
    this.manualPitch = clamp(this.manualPitch + ctx.aimDelta.pitch, -0.2, 0.2)
    if (!pushing) {
      const a = expAlpha(dt, 0.6)
      this.manualYaw -= this.manualYaw * a
      this.manualPitch -= this.manualPitch * a
    }

    const gy = clamp(ctx.gyro.yaw, -GYRO_PAN_LIMIT, GYRO_PAN_LIMIT)
    const gp = clamp(ctx.gyro.pitch, -GYRO_PAN_LIMIT, GYRO_PAN_LIMIT)
    return {
      position: this.position.clone(),
      yaw: this.yaw.value + this.manualYaw + gy,
      pitch: clamp(this.pitch.value + this.manualPitch + gp, -PITCH_LIMIT, PITCH_LIMIT),
      roll: ctx.gyro.roll * 0.3,
    }
  }
}
