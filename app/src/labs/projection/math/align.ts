// Fitting a settled view's depth to the set that already exists. Pure (no DOM, no three), shared by the offline
// settle script and the lab, unit-tested.
//
// The new view's depth (MoGe-2 on the inpainted frame) and the set's rendered depth come from the same camera, so
// they differ by the depth model's scale error (and, if allowed, a constant offset). Fit
//   ref ≈ scale · src (+ shift)
// by least squares over pixels valid in both and NOT in the hole mask (eroded, so stretched border pixels at a hole
// edge do not vote), with a couple of trimming passes that drop gross outliers (thin geometry the two disagree on).

const valid = (d: number) => d > 0 && Number.isFinite(d)

/** Square (Chebyshev) dilation of a binary mask by r pixels; separable, O(n·r). */
export function dilateMask(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice()
  const tmp = new Uint8Array(mask.length)
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0
      for (let k = Math.max(0, x - r); k <= Math.min(width - 1, x + r) && !on; k++) on = mask[y * width + k]
      tmp[y * width + x] = on ? 1 : 0
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0
      for (let k = Math.max(0, y - r); k <= Math.min(height - 1, y + r) && !on; k++) on = tmp[k * width + x]
      out[y * width + x] = on ? 1 : 0
    }
  }
  return out
}

/** Pixels usable for the fit: both depths valid, and at least `margin` px away from any hole. */
export function fitRegion(
  src: Float32Array, ref: Float32Array, holes: Uint8Array, width: number, height: number, margin: number,
): Uint8Array {
  const near = dilateMask(holes, width, height, margin)
  const use = new Uint8Array(src.length)
  for (let i = 0; i < use.length; i++) use[i] = !near[i] && valid(src[i]) && valid(ref[i]) ? 1 : 0
  return use
}

export interface AlignStats {
  /** samples used in the final fit */
  n: number
  /** root-mean-square residual, in ref units (metres) */
  rmse: number
  /** median and 90th percentile of |ref - fit| / ref */
  medianRel: number
  p90Rel: number
}

export interface Alignment extends AlignStats {
  scale: number
  shift: number
  /** residuals over every candidate pixel, before trimming (what the outliers cost) */
  all: AlignStats
}

export interface AlignOptions {
  /** fit a constant offset as well as a scale (default false: metric depth models err mostly in scale) */
  shift?: boolean
  /** trimming passes; each drops samples whose relative residual exceeds `trimRel` (default 2 passes, 10 %) */
  passes?: number
  trimRel?: number
}

function solve(src: Float32Array, ref: Float32Array, use: Uint8Array, withShift: boolean): { scale: number; shift: number } {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0
  for (let i = 0; i < use.length; i++) {
    if (!use[i]) continue
    const x = src[i], y = ref[i]
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y
  }
  if (n === 0) return { scale: NaN, shift: NaN }
  if (!withShift || n < 2) return { scale: sxy / sxx, shift: 0 }
  const vx = sxx - (sx * sx) / n
  const scale = (sxy - (sx * sy) / n) / vx
  return { scale, shift: (sy - scale * sx) / n }
}

function medianRatio(src: Float32Array, ref: Float32Array, use: Uint8Array): number {
  const r: number[] = []
  for (let i = 0; i < use.length; i++) if (use[i]) r.push(ref[i] / src[i])
  r.sort((a, b) => a - b)
  return quantile(r, 0.5)
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}

function stats(src: Float32Array, ref: Float32Array, use: Uint8Array, scale: number, shift: number): AlignStats {
  const rel: number[] = []
  let sq = 0
  for (let i = 0; i < use.length; i++) {
    if (!use[i]) continue
    const r = ref[i] - (scale * src[i] + shift)
    sq += r * r
    rel.push(Math.abs(r) / ref[i])
  }
  rel.sort((a, b) => a - b)
  return { n: rel.length, rmse: rel.length ? Math.sqrt(sq / rel.length) : NaN, medianRel: quantile(rel, 0.5), p90Rel: quantile(rel, 0.9) }
}

/** Least-squares ref ≈ scale·src (+ shift) over `use`, with trimming; residuals reported before and after. */
export function alignDepth(src: Float32Array, ref: Float32Array, use: Uint8Array, opt: AlignOptions = {}): Alignment {
  const withShift = opt.shift ?? false
  const passes = opt.passes ?? 2
  const trimRel = opt.trimRel ?? 0.1
  let keep = use.slice()
  // Robust start: the median ratio, so one wild sample cannot drag the first trim off everything.
  let fit = passes > 0 ? { scale: medianRatio(src, ref, use), shift: 0 } : solve(src, ref, keep, withShift)
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(keep.length)
    for (let i = 0; i < keep.length; i++) {
      if (use[i] && Math.abs(ref[i] - (fit.scale * src[i] + fit.shift)) <= trimRel * ref[i]) next[i] = 1
    }
    keep = next
    fit = solve(src, ref, keep, withShift)
  }
  return { ...fit, ...stats(src, ref, keep, fit.scale, fit.shift), all: stats(src, ref, use, fit.scale, fit.shift) }
}

/** Apply a fit: depth' = scale·depth + shift, invalid stays 0. */
export function applyAlignment(depth: Float32Array, a: { scale: number; shift: number }): Float32Array {
  const out = new Float32Array(depth.length)
  for (let i = 0; i < out.length; i++) out[i] = valid(depth[i]) ? Math.max(0, a.scale * depth[i] + a.shift) : 0
  return out
}
