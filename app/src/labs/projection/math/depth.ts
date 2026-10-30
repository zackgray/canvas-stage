// Turning a depth *image* into planar depth.
//
// v = raw / maxRaw in [0, 1]. The convention says which end is near; the mode says what v is linear in.
//   inverse (relative, Depth Anything V2 style): disparity = near-bright ? v : 1 - v
//                                                depth = 1 / (scale * disparity + shift)
//   linear  (metric passthrough):                distance = near-dark ? v : 1 - v
//                                                depth = scale * distance + shift
// Non-positive or non-finite results are invalid and come back as NaN.

export type DepthConvention = 'near-bright' | 'near-dark'
export type DepthMode = 'inverse' | 'linear'

export interface DepthParams {
  mode: DepthMode
  scale: number
  shift: number
}

export interface DepthImage {
  width: number
  height: number
  /** normalised raw values in [0, 1], top row first */
  values: Float32Array
}

export function defaultMode(convention: DepthConvention): DepthMode {
  return convention === 'near-bright' ? 'inverse' : 'linear'
}

/** Sensible starting params: inverse spans ~0.9-10 units; linear passes metres straight through when known. */
export function defaultParams(mode: DepthMode, metresAtFullScale?: number): DepthParams {
  if (mode === 'inverse') return { mode, scale: 1, shift: 0.1 }
  return { mode, scale: metresAtFullScale ?? 20, shift: 0 }
}

export function convertValue(v: number, convention: DepthConvention, p: DepthParams): number {
  let d: number
  if (p.mode === 'inverse') {
    const disparity = convention === 'near-bright' ? v : 1 - v
    d = 1 / (p.scale * disparity + p.shift)
  } else {
    const distance = convention === 'near-dark' ? v : 1 - v
    d = p.scale * distance + p.shift
  }
  return d > 0 && Number.isFinite(d) ? d : NaN
}

export function toDepth(img: DepthImage, convention: DepthConvention, p: DepthParams): Float32Array {
  const out = new Float32Array(img.values.length)
  for (let i = 0; i < out.length; i++) out[i] = convertValue(img.values[i], convention, p)
  return out
}

/** Normalise integer samples to [0, 1]. */
export function normalise(raw: ArrayLike<number>, maxValue: number): Float32Array {
  const out = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] / maxValue
  return out
}

export function depthRange(depth: Float32Array): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const d of depth) {
    if (!(d > 0) || !Number.isFinite(d)) continue
    if (d < min) min = d
    if (d > max) max = d
  }
  return { min, max }
}

/**
 * [near, far] for encoding one rendered view: the view's OWN valid depth (near = 0.5·min for headroom, far = max),
 * so nothing it rendered clamps — a backed-up or off-angle view sees farther than the source still did. Falls back
 * to `fallback` (the source's range) only when the view rendered no geometry at all.
 */
export function viewDepthRange(depth: Float32Array, fallback: { min: number; max: number }): { near: number; far: number } {
  const own = depthRange(depth)
  const r = Number.isFinite(own.min) ? own : fallback
  return { near: r.min * 0.5, far: r.max }
}

/** Encode depth as near-bright normalised inverse depth over a fixed [near, far]; invalid -> 0. */
export function encodeInverse16(depth: Float32Array, near: number, far: number): Uint16Array {
  const out = new Uint16Array(depth.length)
  const a = 1 / near
  const b = 1 / far
  for (let i = 0; i < depth.length; i++) {
    const d = depth[i]
    if (!(d > 0) || !Number.isFinite(d)) continue
    const t = (1 / d - b) / (a - b)
    out[i] = Math.max(1, Math.round(Math.min(1, Math.max(0, t)) * 65535)) // 0 is reserved for "no depth"
  }
  return out
}
