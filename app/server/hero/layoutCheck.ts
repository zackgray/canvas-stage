/**
 * Does the still match the set? (Wave 0 P1: at depth strength 1.0 Qwen still drew a long palisade where the clay has a short one,
 * and LTX followed the still.) A free, local check at low resolution: the clay's inverse depth (what the draw was locked to) and
 * the still's luma are box-averaged to a 96x54 grid (one cell = 20 px, finer texture gone), Sobel edges are taken from each
 * (the strongest EDGE_SHARE of cells), and the score is the F1 of the two edge sets with one cell of tolerance: recall = clay
 * edges the still has (an outline the still dropped or moved), precision = still edges the clay explains (a structure the still
 * invented, e.g. a palisade drawn longer into the sky). Below LAYOUT_MIN_SCORE the still says "doesn't match the set".
 * Calibrated (2026-10-25) on 23 experiment stills against their own depth: the P1 drifted Qwen draws and their Klein finishes
 * 0.29-0.35, a still of another camera 0.14-0.21, the depth-locked stills judged right (E115 C/D, E118, E123) 0.40-0.73; the same
 * stills against a wrong depth 0.22-0.42. Threshold 0.38. It is a flag for the owner, never a refusal: the still is kept and shown.
 * Server-side only.
 */
import { readFileSync } from 'node:fs'
import { boxDown, inverseDepth, metres, readChannel0, readLuma, type Grey } from './depthImage.ts'
import { LAYOUT_MIN_SCORE, LAYOUT_WARNING, type LayoutCheck } from './kitSpec.ts'

export const GRID_W = 96
export const GRID_H = 54
/** the share of cells counted as edges in each image */
export const EDGE_SHARE = 0.1

export function sobel(g: Grey): Float32Array {
  const { width: w, height: h, data: d } = g, out = new Float32Array(w * h)
  const at = (x: number, y: number) => d[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)
    const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
    out[y * w + x] = Math.hypot(gx, gy)
  }
  return out
}

/** the strongest `share` of cells (ties at the cut included); every non-flat cell when fewer than that are; none when the image is flat */
export function topEdges(mag: Float32Array, share = EDGE_SHARE): Uint8Array {
  const sorted = Float32Array.from(mag).sort()
  const cut = Math.max(1e-6, sorted[Math.max(0, Math.floor(sorted.length * (1 - share)))])
  const out = new Uint8Array(mag.length)
  for (let i = 0; i < mag.length; i++) out[i] = mag[i] >= cut ? 1 : 0
  return out
}

function dilate(e: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(e.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!e[y * w + x]) continue
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx
      if (yy >= 0 && yy < h && xx >= 0 && xx < w) out[yy * w + xx] = 1
    }
  }
  return out
}

const hits = (a: Uint8Array, near: Uint8Array) => { let n = 0, k = 0; for (let i = 0; i < a.length; i++) if (a[i]) { n++; if (near[i]) k++ } return n ? k / n : 0 }

/** precision, recall and their F1 of the still's edges against the clay depth's, both on the grid */
export function layoutScore(depth01: Grey, stillLuma: Grey): { score: number; precision: number; recall: number } {
  const D = topEdges(sobel(boxDown(depth01, GRID_W, GRID_H))), S = topEdges(sobel(boxDown(stillLuma, GRID_W, GRID_H)))
  const recall = hits(D, dilate(S, GRID_W, GRID_H)), precision = hits(S, dilate(D, GRID_W, GRID_H))
  const score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  const r2 = (v: number) => Math.round(v * 100) / 100
  return { score: r2(score), precision: r2(precision), recall: r2(recall) }
}

export function verdict(score: number, min = LAYOUT_MIN_SCORE): LayoutCheck {
  const ok = score >= min
  return { score, ok, message: ok ? null : `${LAYOUT_WARNING} (layout ${score.toFixed(2)}, under ${min})` }
}

/** The check on files: the clay frame's zdepth (16-bit) and the finished still (8-bit PNG). Null when either cannot be read. */
export function checkLayout(zdepthFile: string, stillFile: string): LayoutCheck | null {
  try {
    const z = readChannel0(readFileSync(zdepthFile))
    const depth: Grey = { width: z.width, height: z.height, data: inverseDepth(metres(z)) }
    return verdict(layoutScore(depth, readLuma(readFileSync(stillFile))).score)
  } catch { return null }
}
