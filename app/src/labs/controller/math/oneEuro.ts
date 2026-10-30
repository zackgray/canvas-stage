// One Euro filter (Casiez et al. 2012): low lag on fast moves, strong smoothing when slow.
// Used live and offline; offline we run it forward and backward so the result has no lag.

function alpha(cutoffHz: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dt)
}

export interface OneEuroParams {
  /** Hz. Lower = smoother when still. */
  minCutoff: number
  /** Speed coefficient. Higher = less lag on fast moves. */
  beta: number
  /** Hz, for the derivative estimate. */
  dCutoff: number
}

export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.0, beta: 0.4, dCutoff: 1.0 }

export class OneEuro {
  private x: number | null = null
  private dx = 0
  private readonly p: OneEuroParams

  constructor(params: OneEuroParams = DEFAULT_ONE_EURO) {
    this.p = params
  }

  filter(value: number, dt: number): number {
    if (this.x === null || dt <= 0) {
      this.x = value
      return value
    }
    const rawDx = (value - this.x) / dt
    this.dx += alpha(this.p.dCutoff, dt) * (rawDx - this.dx)
    const cutoff = this.p.minCutoff + this.p.beta * Math.abs(this.dx)
    this.x += alpha(cutoff, dt) * (value - this.x)
    return this.x
  }
}

/** One-directional pass over evenly spaced samples. */
export function oneEuroPass(values: number[], dt: number, params: OneEuroParams): number[] {
  const f = new OneEuro(params)
  return values.map((v) => f.filter(v, dt))
}

/** Zero-phase smoothing: forward pass, then a backward pass over the result. */
export function oneEuroZeroPhase(values: number[], dt: number, params: OneEuroParams): number[] {
  const fwd = oneEuroPass(values, dt, params)
  return oneEuroPass(fwd.reverse(), dt, params).reverse()
}
