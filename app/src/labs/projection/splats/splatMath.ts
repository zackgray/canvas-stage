// Small pure helpers for the depth-to-splat converter: opacity conventions and rotation from a basis.

/**
 * Opacity conventions. Spark's in-memory splats (setPackedSplat / encodeExtSplat) take LINEAR opacity in [0, 1]
 * (packed alpha byte = opacity * 255). A 3DGS .ply stores the PRE-SIGMOID logit and readers apply a sigmoid.
 * WorldGen's bug was writing 1.0 raw into a .ply (reads back as sigmoid(1) = 0.73). fromDepth emits linear
 * opacity; use toPlyOpacity only when writing a .ply.
 */
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/** Linear opacity -> .ply logit (clamped so 0 and 1 stay finite). */
export function toPlyOpacity(a: number): number {
  const c = Math.min(1 - 1e-6, Math.max(1e-6, a))
  return Math.log(c / (1 - c))
}

/**
 * Unit quaternion [x, y, z, w] of the rotation whose columns are the orthonormal right-handed basis (ux, vy, nz):
 * local +x -> u, +y -> v, +z -> n. Shepperd's method; writes into out at offset o.
 */
export function quatFromBasis(
  ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, nx: number, ny: number, nz: number,
  out: Float32Array, o: number,
) {
  // matrix m[row][col]: col 0 = u, col 1 = v, col 2 = n
  const m00 = ux, m10 = uy, m20 = uz
  const m01 = vx, m11 = vy, m21 = vz
  const m02 = nx, m12 = ny, m22 = nz
  const tr = m00 + m11 + m22
  let x: number, y: number, z: number, w: number
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1)
    w = 0.25 / s
    x = (m21 - m12) * s
    y = (m02 - m20) * s
    z = (m10 - m01) * s
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
    w = (m21 - m12) / s
    x = 0.25 * s
    y = (m01 + m10) / s
    z = (m02 + m20) / s
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
    w = (m02 - m20) / s
    x = (m01 + m10) / s
    y = 0.25 * s
    z = (m12 + m21) / s
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
    w = (m10 - m01) / s
    x = (m02 + m20) / s
    y = (m12 + m21) / s
    z = 0.25 * s
  }
  out[o] = x
  out[o + 1] = y
  out[o + 2] = z
  out[o + 3] = w
}
