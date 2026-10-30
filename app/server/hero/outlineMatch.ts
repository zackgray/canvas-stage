/**
 * Does the still have this person where the clay puts them? A free local measure per staged person: the share of their clay
 * outline (the ID-pass silhouette's edge) that has a strong edge in the still nearby. A person drawn on their mark makes an edge
 * against what is behind them along most of that outline; a person missing, moved or drawn much larger leaves it to the background
 * and scores low. Worked on a grid whose cell scales with the figure (1/40 of its height, at least 3 px), so a small pose
 * difference does not count; the still's edges are its strongest cells in the padded box (as many as the outline has cells), with one
 * cell of tolerance. Calibration on real stills: redrawSpec.ts PERSON_MIN_MATCH. Server-side.
 */
import type { Mask, Rgba } from './idMask.ts'
import type { PassBox } from '../../src/shared/passContract.ts'

const CELLS_PER_HEIGHT = 40
const TOLERANCE = 1
const EDGE_RATIO = 1

/** the outline match, 0..1; null when the box is too small to say (under 4 cells of outline) */
export function outlineMatch(still: Rgba, person: Mask, box: PassBox, figureH: number): number | null {
  const o = { cells: CELLS_PER_HEIGHT, tol: TOLERANCE, ratio: EDGE_RATIO }
  const c = Math.max(3, Math.round(figureH / o.cells))
  const gw = Math.floor(box.w / c), gh = Math.floor(box.h / c)
  if (gw < 3 || gh < 3) return null
  const sw = still.width, mw = person.width
  // the still's luma and the person's coverage, box-averaged per cell
  const luma = new Float32Array(gw * gh), cover = new Float32Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let l = 0, m = 0
    for (let y = 0; y < c; y++) for (let x = 0; x < c; x++) {
      const px = box.x + gx * c + x, py = box.y + gy * c + y, i = (py * sw + px) * 4
      l += 0.299 * still.data[i] + 0.587 * still.data[i + 1] + 0.114 * still.data[i + 2]
      m += person.data[py * mw + px]
    }
    luma[gy * gw + gx] = l / (c * c); cover[gy * gw + gx] = m / (c * c)
  }
  // outline cells: partly covered, or covered next to an uncovered cell
  const at = (a: Float32Array, x: number, y: number) => a[Math.min(gh - 1, Math.max(0, y)) * gw + Math.min(gw - 1, Math.max(0, x))]
  const outline: number[] = []
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const v = cover[y * gw + x]
    if (v <= 0) continue
    if (v < 1 || at(cover, x - 1, y) === 0 || at(cover, x + 1, y) === 0 || at(cover, x, y - 1) === 0 || at(cover, x, y + 1) === 0) outline.push(y * gw + x)
  }
  if (outline.length < 4) return null
  // the still's strongest edge cells (Sobel on the cell luma)
  const mag = new Float32Array(gw * gh)
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const gx = at(luma, x + 1, y - 1) + 2 * at(luma, x + 1, y) + at(luma, x + 1, y + 1) - at(luma, x - 1, y - 1) - 2 * at(luma, x - 1, y) - at(luma, x - 1, y + 1)
    const gy = at(luma, x - 1, y + 1) + 2 * at(luma, x, y + 1) + at(luma, x + 1, y + 1) - at(luma, x - 1, y - 1) - 2 * at(luma, x, y - 1) - at(luma, x + 1, y - 1)
    mag[y * gw + x] = Math.hypot(gx, gy)
  }
  const k = Math.min(mag.length, Math.round(outline.length * o.ratio))
  const cut = Math.max(1e-6, Float32Array.from(mag).sort()[mag.length - k])
  const near = new Uint8Array(gw * gh)
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (mag[y * gw + x] < cut) continue
    for (let dy = -o.tol; dy <= o.tol; dy++) for (let dx = -o.tol; dx <= o.tol; dx++) {
      const yy = y + dy, xx = x + dx
      if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) near[yy * gw + xx] = 1
    }
  }
  const hit = outline.filter((i) => near[i]).length
  return Math.round((hit / outline.length) * 100) / 100
}
