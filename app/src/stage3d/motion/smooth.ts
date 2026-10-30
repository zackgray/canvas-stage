/**
 * Mocap clean-up (2026-10-28, the walk stumble): optical capture leaves marker jitter in the frames, worst where a foot leaves the
 * ground (CMU 35_01, the walk: the left foot and toe flick 20 to 30 degrees frame to frame for a tenth of a second at every toe-off,
 * and the hip loses a fifth of its speed for a frame), which plays as a stumble once per stride at every walking pace. Every clip is
 * low-passed once at load: a Gaussian over time (sigma in seconds, so a clip's frame rate does not change how much is smoothed) on
 * each joint's rotation and on the root position. Human movement sits well under the cut, so strides, holds and reaches keep their
 * shape; frame-to-frame flicker does not survive it. Pure: returns a new Bvh, the input is untouched.
 */
import * as THREE from 'three'
import type { Bvh } from './bvh.ts'

/** seconds: the filter's sigma (about 9 Hz at half power: a walk's foot moves well under that, capture jitter well over it) */
export const SMOOTH_SIGMA_S = 0.02

export function smoothBvh(b: Bvh, sigma = SMOOTH_SIGMA_S): Bvh {
  const s = sigma / b.frameTime, R = Math.ceil(3 * s)
  if (R < 1) return b
  const w = Array.from({ length: 2 * R + 1 }, (_, k) => Math.exp(-((k - R) ** 2) / (2 * s * s)))
  const J = b.joints.length, F = b.frames, quats = new Float32Array(b.quats.length), roots = new Float32Array(b.roots.length)
  const c = new THREE.Quaternion(), q = new THREE.Quaternion(), acc = new THREE.Vector4()
  for (let f = 0; f < F; f++) {
    const lo = Math.max(0, f - R), hi = Math.min(F - 1, f + R)
    let wsum = 0, x = 0, y = 0, z = 0
    for (let g = lo; g <= hi; g++) { const k = w[g - f + R]; wsum += k; x += k * b.roots[g * 3]; y += k * b.roots[g * 3 + 1]; z += k * b.roots[g * 3 + 2] }
    roots[f * 3] = x / wsum; roots[f * 3 + 1] = y / wsum; roots[f * 3 + 2] = z / wsum
    for (let j = 0; j < J; j++) {
      c.fromArray(b.quats, (f * J + j) * 4); acc.set(0, 0, 0, 0)
      for (let g = lo; g <= hi; g++) { // a weighted mean on the centre frame's hemisphere (the window is short: close to a slerp mean)
        q.fromArray(b.quats, (g * J + j) * 4)
        const k = w[g - f + R] * (q.dot(c) < 0 ? -1 : 1)
        acc.set(acc.x + k * q.x, acc.y + k * q.y, acc.z + k * q.z, acc.w + k * q.w)
      }
      q.set(acc.x, acc.y, acc.z, acc.w).normalize().toArray(quats, (f * J + j) * 4)
    }
  }
  return { ...b, quats, roots }
}
