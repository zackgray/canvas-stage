// Offline smoothing of a recorded take: zero-phase One Euro per channel, so the smoothed camera
// doesn't lag behind the car the way a live filter would.
import type { OneEuroParams } from '../math/oneEuro'
import { oneEuroZeroPhase } from '../math/oneEuro'
import type { CameraSample, QuatT } from './types'
import { qDot, qNormalize } from './types'

export const TAKE_SMOOTHING: OneEuroParams = { minCutoff: 1.2, beta: 0.3, dCutoff: 1.0 }

/** Flip quaternion signs so neighbours sit in the same hemisphere (q and -q are the same rotation). */
export function alignHemispheres(qs: QuatT[]): QuatT[] {
  const out: QuatT[] = []
  for (const q of qs) {
    const prev = out[out.length - 1]
    out.push(prev && qDot(prev, q) < 0 ? [-q[0], -q[1], -q[2], -q[3]] : [...q])
  }
  return out
}

export function smoothSamples(samples: CameraSample[], fps: number, params: OneEuroParams = TAKE_SMOOTHING): CameraSample[] {
  if (samples.length < 3) return samples.map((s) => ({ ...s }))
  const dt = 1 / fps
  const chan = (pick: (s: CameraSample) => number) => oneEuroZeroPhase(samples.map(pick), dt, params)
  const px = chan((s) => s.position[0])
  const py = chan((s) => s.position[1])
  const pz = chan((s) => s.position[2])
  const qs = alignHemispheres(samples.map((s) => s.quaternion))
  const q = [0, 1, 2, 3].map((i) => oneEuroZeroPhase(qs.map((x) => x[i]), dt, params))
  const focal = chan((s) => s.focal)
  const focus = samples.every((s) => s.focus !== undefined) ? chan((s) => s.focus as number) : null // an older take's focus rides along
  return samples.map((s, i) => ({
    t: s.t,
    position: [px[i], py[i], pz[i]],
    quaternion: qNormalize([q[0][i], q[1][i], q[2][i], q[3][i]]),
    focal: focal[i],
    ...(focus ? { focus: focus[i] } : {}),
  }))
}
