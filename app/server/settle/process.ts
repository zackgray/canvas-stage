/**
 * The offline half of a settle turn, pure: MoGe depth on the filled view -> metres -> least-squares aligned to the
 * set's own rendered depth -> soft edges snapped -> what is still missing. Shared by the endpoint and unit tests.
 *
 * Alignment: ref ≈ scale·src (+ shift) over pixels valid in both and >= FIT_MARGIN px from any hole (the set's
 * pixels at a hole edge are stretched), robust median start + trimming (align.ts). Shift only when it buys a real
 * improvement (> 20 % lower inlier RMSE) — metric models err mostly in scale. Saturated reference pixels (raw 1 or
 * 65535: clamped at export) are left out. Snapping uses the lab's defaults, so a
 * settled patch cuts at silhouettes instead of smearing across them (column-coloured smears at 30° without it).
 */
import { alignDepth, applyAlignment, fitRegion, type Alignment } from '../../src/labs/projection/math/align.ts'
import { sharpenEdges } from '../../src/labs/projection/math/filters.ts'
import { decodeInverse16 } from '../../src/labs/projection/math/settle.ts'
import { fitInverse, mogeMetres, type InverseFit, type MogeRender } from './moge.ts'

export const FIT_MARGIN = 3
/** The projection lab's default "Snap soft edges" radius (px) and edge threshold. */
export const SNAP = { radius: 3, threshold: 0.04 } as const

export interface SettleInputs {
  width: number
  height: number
  /** the view export's depth.png first channel (near-bright inverse 16-bit over [near, far], 0 = none) */
  refRaw: ArrayLike<number>
  near: number
  far: number
  /** 1 = hole in the exported view */
  holes: Uint8Array
  /** MoGe on the filled view: normalised inverse render, its valid mask (0..1), and point map */
  moge: MogeRender
  mogeValid: ArrayLike<number>
  points: { positions: Float32Array; uvs: Float32Array }
}

export interface SettleResult {
  /** aligned, snapped planar metres; 0 = invalid */
  depth: Float32Array
  fit: InverseFit
  alignment: Alignment
  applied: 'scale only' | 'scale + shift'
  scaleOnly: Alignment
  withShift: Alignment
  /** fractions of the whole frame */
  holesBefore: number
  holesAfter: number
  skyFraction: number
}

/**
 * Sky: MoGe-invalid pixels connected to the top edge of the frame (4-connected flood fill). MoGe leaves sky empty
 * by design, so those are reported apart from genuinely unfilled holes.
 */
export function skyMask(invalid: Uint8Array, width: number, height: number): Uint8Array {
  const sky = new Uint8Array(invalid.length)
  const stack: number[] = []
  for (let x = 0; x < width; x++) if (invalid[x]) { sky[x] = 1; stack.push(x) }
  while (stack.length) {
    const i = stack.pop()!
    const x = i % width, y = (i - x) / width
    const next = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]
    for (const j of next) if (j >= 0 && invalid[j] && !sky[j]) { sky[j] = 1; stack.push(j) }
  }
  return sky
}

/** Pick scale-only unless scale+shift lowers the inlier RMSE by more than 20 %. Throws when no fit is possible. */
export function chooseAlignment(src: Float32Array, ref: Float32Array, use: Uint8Array) {
  const scaleOnly = alignDepth(src, ref, use)
  const withShift = alignDepth(src, ref, use, { shift: true })
  const useShift = Number.isFinite(withShift.rmse) && withShift.rmse < 0.8 * scaleOnly.rmse
  const chosen = useShift ? withShift : scaleOnly
  if (!Number.isFinite(chosen.scale) || !(chosen.scale > 0) || !Number.isFinite(chosen.shift) || chosen.n === 0) {
    throw new Error(`alignment failed: ${chosen.n} usable pixels, scale ${chosen.scale}`)
  }
  return { scaleOnly, withShift, chosen, applied: useShift ? ('scale + shift' as const) : ('scale only' as const) }
}

/** The sanity gate on the chosen fit lives in math/fitGate.ts, shared with the lab's loader (one rule, both sides). */
export { GATE, refuseFit } from '../../src/labs/projection/math/fitGate.ts'

export function settleDepth(inp: SettleInputs): SettleResult {
  const { width: W, height: H, holes } = inp
  const N = W * H
  if (inp.moge.width !== W || inp.moge.height !== H) throw new Error(`MoGe depth ${inp.moge.width}x${inp.moge.height}, view ${W}x${H}`)
  if (holes.length !== N || inp.refRaw.length !== N || inp.mogeValid.length !== N) throw new Error('input size mismatch')

  const fit = fitInverse(inp.points.positions, inp.points.uvs, inp.moge)
  const src = mogeMetres(inp.moge, fit, inp.mogeValid)
  const ref = decodeInverse16(inp.refRaw, inp.near, inp.far)
  const use = fitRegion(src, ref, holes, W, H, FIT_MARGIN)
  // A reference pinned at either end of the 16-bit range was clamped at export (beyond [near, far]): its depth is
  // unknown, so it must not vote. Exports now encode over the view's own range, so this only bites older exports.
  for (let i = 0; i < N; i++) if (inp.refRaw[i] === 1 || inp.refRaw[i] >= 65535) use[i] = 0
  const { scaleOnly, withShift, chosen, applied } = chooseAlignment(src, ref, use)
  const depth = sharpenEdges(applyAlignment(src, chosen), W, H, SNAP.radius, SNAP.threshold)

  const invalid = new Uint8Array(N)
  for (let i = 0; i < N; i++) invalid[i] = depth[i] > 0 && Number.isFinite(depth[i]) ? 0 : 1
  const sky = skyMask(invalid, W, H)
  let holeCount = 0, unfilled = 0, skyHoles = 0
  for (let i = 0; i < N; i++) {
    if (!holes[i]) continue
    holeCount++
    if (sky[i]) skyHoles++
    else if (invalid[i]) unfilled++
  }
  return {
    depth, fit, alignment: chosen, applied, scaleOnly, withShift,
    holesBefore: holeCount / N, holesAfter: unfilled / N, skyFraction: skyHoles / N,
  }
}
