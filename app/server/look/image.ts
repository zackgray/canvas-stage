/**
 * Linear-light float RGB images for the finish (ported from experiments/lib/e14-image.ts): PNG bytes <-> linear RGB,
 * and a separable gaussian blur (three box passes per axis). Server-side only (pngjs).
 */
import { PNG } from 'pngjs'

export type Rgb = { width: number; height: number; data: Float32Array }

export const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
export const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)
const LUT = Float32Array.from({ length: 256 }, (_, i) => toLin(i / 255))

/** 8-bit PNG (any colour type pngjs reads) -> linear RGB; alpha is dropped. */
export function decodeLinear(png: Uint8Array): Rgb {
  const p = PNG.sync.read(Buffer.from(png))
  const data = new Float32Array(p.width * p.height * 3)
  for (let i = 0; i < p.width * p.height; i++) for (let k = 0; k < 3; k++) data[i * 3 + k] = LUT[p.data[i * 4 + k]]
  return { width: p.width, height: p.height, data }
}

/** Linear RGB -> opaque 8-bit sRGB PNG bytes (deterministic: same pixels, same bytes). */
export function encodeLinear(im: Rgb): Buffer {
  const p = new PNG({ width: im.width, height: im.height })
  for (let i = 0; i < im.width * im.height; i++) {
    for (let k = 0; k < 3; k++) p.data[i * 4 + k] = Math.round(255 * Math.min(1, Math.max(0, toSrgb(Math.max(0, im.data[i * 3 + k])))))
    p.data[i * 4 + 3] = 255
  }
  return PNG.sync.write(p)
}

/** Packed 8-bit sRGB (rgb24, a decoded video frame) -> linear RGB. */
export function fromRgb24(px: Uint8Array, width: number, height: number): Rgb {
  if (px.length !== width * height * 3) throw new Error(`rgb24 frame has ${px.length} bytes, ${width}×${height} needs ${width * height * 3}`)
  const data = new Float32Array(px.length)
  for (let i = 0; i < px.length; i++) data[i] = LUT[px[i]]
  return { width, height, data }
}

/** Linear RGB -> packed 8-bit sRGB (rgb24), rounded exactly as encodeLinear rounds. */
export function toRgb24(im: Rgb): Uint8Array {
  const out = new Uint8Array(im.data.length)
  for (let i = 0; i < out.length; i++) out[i] = Math.round(255 * Math.min(1, Math.max(0, toSrgb(Math.max(0, im.data[i])))))
  return out
}

/** One box pass of radius r along x (dir 0) or y (dir 1) over `ch` interleaved channels, edge-clamped. */
function boxPass(src: Float32Array, w: number, h: number, ch: number, r: number, dir: 0 | 1): Float32Array {
  const out = new Float32Array(src.length)
  const [len, lines] = dir === 0 ? [w, h] : [h, w]
  const idx = (line: number, t: number) => (dir === 0 ? line * w + t : t * w + line) * ch
  const n = 2 * r + 1
  for (let line = 0; line < lines; line++) {
    for (let k = 0; k < ch; k++) {
      let acc = 0
      for (let t = -r; t <= r; t++) acc += src[idx(line, Math.min(len - 1, Math.max(0, t))) + k]
      for (let t = 0; t < len; t++) {
        out[idx(line, t) + k] = acc / n
        acc += src[idx(line, Math.min(len - 1, t + r + 1)) + k] - src[idx(line, Math.max(0, t - r)) + k]
      }
    }
  }
  return out
}

/** Approximate gaussian blur (sigma in px) of interleaved `ch`-channel data. Symmetric, so it never shifts an edge. */
export function blur(src: Float32Array, w: number, h: number, ch: number, sigma: number): Float32Array {
  if (sigma < 0.3) return src.slice()
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2 - 0.5))
  let a = src
  for (let p = 0; p < 3; p++) a = boxPass(boxPass(a, w, h, ch, r, 0), w, h, ch, r, 1)
  return a
}
