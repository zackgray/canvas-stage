// Critically damped springs (Unity-style SmoothDamp) and angle helpers.
// Spring lag is what makes a follow camera feel like a human operator.

export interface Damped {
  value: number
  velocity: number
}

/** Advance a critically damped spring toward target; smoothTime ≈ time to get most of the way there. */
export function smoothDamp(state: Damped, target: number, smoothTime: number, dt: number): Damped {
  if (smoothTime <= 1e-4 || dt <= 0) return { value: dt > 0 ? target : state.value, velocity: 0 }
  const omega = 2 / smoothTime
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = state.value - target
  const temp = (state.velocity + omega * change) * dt
  return {
    value: target + (change + temp) * exp,
    velocity: (state.velocity - omega * temp) * exp,
  }
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = (a + Math.PI) % (2 * Math.PI)
  if (r < 0) r += 2 * Math.PI
  return r - Math.PI
}

/** SmoothDamp for angles: takes the short way round. */
export function smoothDampAngle(state: Damped, target: number, smoothTime: number, dt: number): Damped {
  const unwrapped = state.value + wrapAngle(target - state.value)
  return smoothDamp(state, unwrapped, smoothTime, dt)
}

/** Frame-rate independent exponential smoothing factor for a time constant tau (seconds). */
export function expAlpha(dt: number, tau: number): number {
  if (tau <= 1e-4) return 1
  return 1 - Math.exp(-dt / tau)
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
