/**
 * Masks cut from the clay's ID pass (src/labs/projection/clay/idPass.ts: one flat colour per entity, each prop its own) and the face
 * oval of a person, as the still judge and the redraws need them. A mask is one byte a pixel (1 = inside), at the ID frame's size
 * until scaled to the still's. Server-side (pngjs).
 */
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import type { PassBox } from '../../src/shared/passContract.ts'

export interface Rgba { width: number; height: number; data: Buffer }
export interface Mask { width: number; height: number; data: Uint8Array }
export interface Bounds { x0: number; y0: number; x1: number; y1: number; n: number }

export const readPng = (file: string): Rgba => { const p = PNG.sync.read(readFileSync(file)); return { width: p.width, height: p.height, data: p.data } }

/** the pixels wearing exactly `rgb` */
export function colourMask(img: Rgba, rgb: readonly [number, number, number]): Mask {
  const { width: w, height: h, data: d } = img, out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) if (d[i * 4] === rgb[0] && d[i * 4 + 1] === rgb[1] && d[i * 4 + 2] === rgb[2]) out[i] = 1
  return { width: w, height: h, data: out }
}

/** a colour more than one tag wears cannot cut one entity out (an old export's shared prop yellow, two extras of one variant) */
export function sharedColour(colors: Record<string, [number, number, number]>, tag: string): boolean {
  const c = colors[tag]
  return !c || Object.entries(colors).some(([t, o]) => t !== tag && o[0] === c[0] && o[1] === c[1] && o[2] === c[2])
}

export function boundsOf(m: Mask): Bounds | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    if (!m.data[y * m.width + x]) continue
    n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  return n ? { x0, y0, x1, y1, n } : null
}

/** nearest-neighbour resize (the ID frame is the clay's size; the still may differ) */
export function scaleMask(m: Mask, w: number, h: number): Mask {
  if (m.width === w && m.height === h) return m
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(m.height - 1, Math.floor((y + 0.5) * m.height / h))
    for (let x = 0; x < w; x++) out[y * w + x] = m.data[sy * m.width + Math.min(m.width - 1, Math.floor((x + 0.5) * m.width / w))]
  }
  return { width: w, height: h, data: out }
}

/** a box padded by `pad` of its size on each side (at least `min` px across), clamped to the frame */
export function padBox(b: Pick<Bounds, 'x0' | 'y0' | 'x1' | 'y1'>, w: number, h: number, pad: number, min = 0): PassBox {
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1
  const px = Math.max(bw * pad, (min - bw) / 2, 0), py = Math.max(bh * pad, (min - bh) / 2, 0)
  const x = Math.max(0, Math.floor(b.x0 - px)), y = Math.max(0, Math.floor(b.y0 - py))
  return { x, y, w: Math.min(w, Math.ceil(b.x1 + 1 + px)) - x, h: Math.min(h, Math.ceil(b.y1 + 1 + py)) - y }
}

/** the head is the top 13 % of a standing figure's silhouette (a 0.23 m head on 1.8 m; E140 prep), its width the silhouette's there */
export const HEAD_SHARE = 0.13

/**
 * The face area of a figure: an oval over the lower part of the head band, narrower than the head, so hair, a hat or a cap peak
 * stay the still's (E141: the whole-head mask grew the conductor's head and flattened his cap; a face-only mask under the peak kept
 * both). Null when the head is cut by the top of the frame or too small to redraw (under 6 px tall).
 */
export function faceOval(m: Mask): PassBox | null {
  const b = boundsOf(m)
  if (!b || b.y0 === 0) return null
  const hb = Math.max(1, Math.round((b.y1 - b.y0 + 1) * HEAD_SHARE))
  if (hb < 6) return null
  let hx0 = Infinity, hx1 = -1
  for (let y = b.y0; y < b.y0 + hb; y++) for (let x = b.x0; x <= b.x1; x++) if (m.data[y * m.width + x]) { if (x < hx0) hx0 = x; if (x > hx1) hx1 = x }
  const cx = (hx0 + hx1 + 1) / 2, hw = hx1 - hx0 + 1
  const rx = Math.max(2, hw * 0.42), top = b.y0 + hb * 0.2, bottom = b.y0 + hb * 1.04
  const x = Math.max(0, Math.floor(cx - rx)), y = Math.max(0, Math.floor(top))
  return { x, y, w: Math.min(m.width, Math.ceil(cx + rx)) - x, h: Math.min(m.height, Math.ceil(bottom)) - y }
}

/** an oval filling `box`, as a mask of the frame */
export function ovalMask(w: number, h: number, box: PassBox): Mask {
  const out = new Uint8Array(w * h), cx = box.x + box.w / 2, cy = box.y + box.h / 2, rx = box.w / 2, ry = box.h / 2
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
    if (dx * dx + dy * dy <= 1) out[y * w + x] = 1
  }
  return { width: w, height: h, data: out }
}

/** the mask as the white-on-black PNG the Klein graph reads (ImageToMask, red channel) */
export function maskPng(m: Mask): Buffer {
  const png = new PNG({ width: m.width, height: m.height })
  for (let i = 0; i < m.width * m.height; i++) { const v = m.data[i] ? 255 : 0; png.data[i * 4] = v; png.data[i * 4 + 1] = v; png.data[i * 4 + 2] = v; png.data[i * 4 + 3] = 255 }
  return PNG.sync.write(png)
}
export const readMaskPng = (file: string): Mask => { const p = readPng(file); const out = new Uint8Array(p.width * p.height); for (let i = 0; i < out.length; i++) out[i] = p.data[i * 4] > 127 ? 1 : 0; return { width: p.width, height: p.height, data: out } }
