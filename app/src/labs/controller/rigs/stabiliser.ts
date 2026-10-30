// Handheld vs stabilised. amount 0 = raw (every gyro micro-shake reaches the lens);
// amount 1 = heavy, gimbal-like smoothing. Applied after the rig, before recording.
import { Quaternion, Vector3 } from 'three'
import { expAlpha } from '../math/spring'

/** Time constant (s) for a smoothing amount: quadratic so the low end stays responsive. */
export function stabiliserTau(amount: number): number {
  const a = Math.min(1, Math.max(0, amount))
  return a * a * 0.6
}

export class Stabiliser {
  amount = 0.5
  enabled = true
  readonly position = new Vector3()
  readonly quaternion = new Quaternion()
  private primed = false

  reset(position: Vector3, quaternion: Quaternion) {
    this.position.copy(position)
    this.quaternion.copy(quaternion)
    this.primed = true
  }

  apply(position: Vector3, quaternion: Quaternion, dt: number) {
    if (!this.primed || !this.enabled) {
      this.reset(position, quaternion)
      return
    }
    const tau = stabiliserTau(this.amount)
    // Rotation gets a slightly longer constant: a heavy camera resists turning more than drifting.
    this.position.lerp(position, expAlpha(dt, tau))
    this.quaternion.slerp(quaternion, expAlpha(dt, tau * 1.3))
  }
}
