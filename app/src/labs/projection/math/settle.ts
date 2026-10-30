// Settled-view geometry: what part of a settled projector's depth becomes mesh. Pure, unit-tested.
//
// Blending rule for the projector stack: the original projector wins wherever it has geometry; a settled
// projector only contributes inside its own hole mask, grown by a few pixels so its patch overlaps the existing
// set at the seam (the patch is drawn slightly farther along the view rays, so where both exist the original still shows).

import { dilateMask } from './align.ts'

/** Depth kept only inside the (grown) hole mask; everything else becomes NaN, i.e. no geometry. */
export function holeOnlyDepth(depth: Float32Array, holes: Uint8Array, width: number, height: number, grow: number): Float32Array {
  const keep = dilateMask(holes, width, height, grow)
  const out = new Float32Array(depth.length)
  for (let i = 0; i < out.length; i++) out[i] = keep[i] && depth[i] > 0 && Number.isFinite(depth[i]) ? depth[i] : NaN
  return out
}

/** Binary hole mask from normalised grey values (white = hole). */
export function maskFromGrey(values: Float32Array, threshold = 0.5): Uint8Array {
  const out = new Uint8Array(values.length)
  for (let i = 0; i < out.length; i++) out[i] = values[i] >= threshold ? 1 : 0
  return out
}

/** Planar depth from the lab's view export (near-bright inverse over [near, far]; 0 = no geometry). */
export function decodeInverse16(raw: ArrayLike<number>, near: number, far: number): Float32Array {
  const out = new Float32Array(raw.length)
  const a = 1 / near
  const b = 1 / far
  for (let i = 0; i < out.length; i++) {
    const v = raw[i]
    out[i] = v > 0 ? 1 / ((v / 65535) * (a - b) + b) : NaN
  }
  return out
}
