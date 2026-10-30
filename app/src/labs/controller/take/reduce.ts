// Keyframe reduction: Ramer-Douglas-Peucker over time, where a sample's "distance" from the
// simplified track is the worst of its position error, rotation error and focal error, each
// divided by its own tolerance. Keeps the fewest keyframes that reproduce the move.
import type { CameraSample } from './types'
import { evaluateTrack, lerpSample, qAngle } from './types'

export interface ReduceTolerance {
  /** metres */
  position: number
  /** degrees */
  angleDeg: number
  /** mm */
  focal: number
}

/** One slider value (1 = default) scales all three tolerances together. */
export function toleranceFromSlider(k: number): ReduceTolerance {
  return { position: 0.03 * k, angleDeg: 0.4 * k, focal: 0.6 * k }
}

export interface SampleError {
  position: number
  angleDeg: number
  focal: number
}

export function sampleError(a: CameraSample, b: CameraSample): SampleError {
  return {
    position: Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]),
    angleDeg: (qAngle(a.quaternion, b.quaternion) * 180) / Math.PI,
    focal: Math.abs(a.focal - b.focal),
  }
}

function normalisedError(e: SampleError, tol: ReduceTolerance): number {
  return Math.max(e.position / tol.position, e.angleDeg / tol.angleDeg, e.focal / tol.focal)
}

/** Returns the kept samples (first and last always kept). Iterative, so long takes can't blow the stack. */
export function reduceKeyframes(samples: CameraSample[], tol: ReduceTolerance): CameraSample[] {
  const n = samples.length
  if (n <= 2) return samples.slice()
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    if (j - i < 2) continue
    const a = samples[i]
    const b = samples[j]
    let worst = 0
    let worstK = -1
    for (let k = i + 1; k < j; k++) {
      const s = samples[k]
      const approx = lerpSample(a, b, (s.t - a.t) / (b.t - a.t), s.t)
      const err = normalisedError(sampleError(s, approx), tol)
      if (err > worst) {
        worst = err
        worstK = k
      }
    }
    if (worst > 1 && worstK > 0) {
      keep[worstK] = 1
      stack.push([i, worstK], [worstK, j])
    }
  }
  return samples.filter((_, i) => keep[i])
}

/** Largest deviation of the keyframe track from the samples it was reduced from. */
export function maxTrackError(samples: CameraSample[], keys: CameraSample[]): SampleError {
  const out: SampleError = { position: 0, angleDeg: 0, focal: 0 }
  for (const s of samples) {
    const e = sampleError(s, evaluateTrack(keys, s.t))
    out.position = Math.max(out.position, e.position)
    out.angleDeg = Math.max(out.angleDeg, e.angleDeg)
    out.focal = Math.max(out.focal, e.focal)
  }
  return out
}
