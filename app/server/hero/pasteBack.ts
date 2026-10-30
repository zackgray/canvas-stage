/**
 * The local, free half of a redraw: the Klein job's stitched picture is pasted onto the still INSIDE the redraw's own mask only,
 * feathered inwards, so not one pixel outside the mask changes (E140: pasting the whole crop ghosted the outline; E141: the face
 * stitch measured 0 changed pixels outside its oval). Then the 100 % before/after crops the Keep / Discard card shows. Server-side.
 */
import { PNG } from 'pngjs'
import type { PassBox } from '../../src/shared/passContract.ts'
import type { Mask, Rgba } from './idMask.ts'

/** a box blur of the mask, `r` px each way (separable, running sums) */
function blur(m: Mask, r: number): Float32Array {
  const { width: w, height: h } = m, tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1
  for (let y = 0; y < h; y++) {
    let s = 0
    for (let x = -r; x <= r; x++) s += m.data[y * w + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n
      s += m.data[y * w + Math.min(w - 1, x + r + 1)] - m.data[y * w + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

/** 0 outside the mask and on its edge, rising to 1 about `r` px inside it */
export function featherInside(m: Mask, r: number): Float32Array {
  if (r < 1) return Float32Array.from(m.data)
  const b = blur(m, r), out = new Float32Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = m.data[i] ? Math.min(1, Math.max(0, (b[i] - 0.5) * 2)) : 0
  return out
}

/** `after` over `before` through the mask's inward feather; both the still's size. Every pixel outside the mask is `before`'s, exactly. */
export function pasteInside(before: Rgba, after: Rgba, m: Mask, featherPx: number): Rgba {
  if (after.width !== before.width || after.height !== before.height || m.width !== before.width || m.height !== before.height) {
    throw new Error(`the redraw came back ${after.width}x${after.height} for a ${before.width}x${before.height} still`)
  }
  const a = featherInside(m, featherPx), out = Buffer.from(before.data)
  for (let i = 0; i < a.length; i++) {
    if (a[i] <= 0) continue
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(before.data[i * 4 + c] * (1 - a[i]) + after.data[i * 4 + c] * a[i])
  }
  return { width: before.width, height: before.height, data: out }
}

export function cropOf(img: Rgba, b: PassBox): Rgba {
  const out = Buffer.alloc(b.w * b.h * 4)
  for (let y = 0; y < b.h; y++) img.data.copy(out, y * b.w * 4, ((b.y + y) * img.width + b.x) * 4, ((b.y + y) * img.width + b.x + b.w) * 4)
  return { width: b.w, height: b.h, data: out }
}

export function pngOf(img: Rgba): Buffer {
  const png = new PNG({ width: img.width, height: img.height })
  img.data.copy(png.data)
  return PNG.sync.write(png)
}
