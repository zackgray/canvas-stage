/**
 * The clay's metric depth as the depth patch takes it, and the small image helpers the layout check uses. A kit clay's depth is
 * zdepth_NNN.png: 16-bit grey, planar metres x CLAY_DEPTH_UNIT_M, 0 or 65535 = nothing drawn (sky). The E115-E126 stills were
 * drawn on the spike page's "near-bright inverse depth" (e114-spike/scene.js ?depth=1): d = clamp((1/z - 1/far) / (1/near - 1/far)),
 * near 4 m, far 250 m, sky black. Same mapping here; when more than 1% of the frame is nearer than 4 m (a close shot, or ground under the camera) near drops
 * to the frame's own 0.5th percentile, so nothing near is one flat white (which Qwen draws as a black band). Server-side only (pngjs).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { CLAY_DEPTH_UNIT_M } from '../../src/shared/shotContract.ts'

export const DEPTH_NEAR_M = 4
export const DEPTH_FAR_M = 250

export interface Grey { width: number; height: number; data: Float32Array }

/** A PNG's first channel as numbers in its own range (0..255 or 0..65535), any colour type pngjs reads. */
export function readChannel0(buf: Buffer): Grey & { max: number } {
  const p = PNG.sync.read(buf, { skipRescale: true }) as unknown as { width: number; height: number; depth: number; data: ArrayLike<number> }
  const n = p.width * p.height, step = Math.round(p.data.length / n) || 1
  const data = new Float32Array(n)
  for (let i = 0; i < n; i++) data[i] = p.data[i * step]
  return { width: p.width, height: p.height, data, max: p.depth === 16 ? 65535 : 255 }
}

/** An 8-bit PNG's luma (Rec. 709 on the sRGB values), 0..1. */
export function readLuma(buf: Buffer): Grey {
  const p = PNG.sync.read(buf)
  const n = p.width * p.height, data = new Float32Array(n)
  for (let i = 0; i < n; i++) data[i] = (0.2126 * p.data[i * 4] + 0.7152 * p.data[i * 4 + 1] + 0.0722 * p.data[i * 4 + 2]) / 255
  return { width: p.width, height: p.height, data }
}

/** zdepth (16-bit) -> metres; NaN where nothing was drawn */
export function metres(z: Grey & { max: number }, unitM = CLAY_DEPTH_UNIT_M): Float32Array {
  const out = new Float32Array(z.data.length)
  for (let i = 0; i < out.length; i++) { const v = z.data[i]; out[i] = v <= 0 || v >= 65535 ? NaN : v * unitM }
  return out
}

/**
 * The near plane for a frame: 4 m, unless more than 1% of the drawn pixels are nearer, then their 0.5th percentile (>= 0.3 m).
 * Anything nearer than `near` clamps to flat white, and Qwen's depth control draws a flat white area as a flat black band
 * (the master and opening stills came back with one along the bottom, 2026-10-23, where the ground under the camera is
 * nearer than 4 m): so the near plane must reach the nearest real surface, however few pixels it covers.
 */
export function nearFor(m: Float32Array): number {
  const drawn: number[] = []
  for (let i = 0; i < m.length; i += 7) if (Number.isFinite(m[i])) drawn.push(m[i]) // a sample is plenty for two percentiles
  drawn.sort((a, b) => a - b)
  if (!drawn.length) return DEPTH_NEAR_M
  const close = drawn.findIndex((v) => v >= DEPTH_NEAR_M)
  if ((close < 0 ? drawn.length : close) / drawn.length <= 0.01) return DEPTH_NEAR_M
  return Math.max(0.3, drawn[Math.floor(drawn.length * 0.005)])
}

/** metres -> near-bright inverse depth, 0..1 (sky 0) */
export function inverseDepth(m: Float32Array, near = nearFor(m), far = DEPTH_FAR_M): Float32Array {
  const out = new Float32Array(m.length), a = 1 / far, span = 1 / near - a
  for (let i = 0; i < m.length; i++) { const z = m[i]; out[i] = Number.isFinite(z) ? Math.min(1, Math.max(0, (1 / Math.max(z, 0.01) - a) / span)) : 0 }
  return out
}

/** writes a grey 0..1 image as an 8-bit RGB PNG (what the depth patch's LoadImage reads) */
export function writeGreyPng(file: string, g: Grey): void {
  const png = new PNG({ width: g.width, height: g.height })
  for (let i = 0; i < g.data.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, g.data[i])) * 255)
    png.data[i * 4] = v; png.data[i * 4 + 1] = v; png.data[i * 4 + 2] = v; png.data[i * 4 + 3] = 255
  }
  writeFileSync(file, PNG.sync.write(png, { colorType: 2 }))
}

/** The clay frame's zdepth as the depth patch's input: reads `zdepthFile`, writes the inverse-depth PNG to `outFile`. */
export function writeDepthControl(zdepthFile: string, outFile: string): Grey {
  const z = readChannel0(readFileSync(zdepthFile))
  const inv: Grey = { width: z.width, height: z.height, data: inverseDepth(metres(z)) }
  writeGreyPng(outFile, inv)
  return inv
}

/** box-average down to w x h (both images of the layout check, so texture finer than a cell is gone) */
export function boxDown(g: Grey, w: number, h: number): Grey {
  const out = new Float32Array(w * h), cnt = new Float32Array(w * h)
  for (let y = 0; y < g.height; y++) {
    const oy = Math.min(h - 1, Math.floor((y * h) / g.height))
    for (let x = 0; x < g.width; x++) {
      const o = oy * w + Math.min(w - 1, Math.floor((x * w) / g.width))
      out[o] += g.data[y * g.width + x]; cnt[o]++
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = cnt[i] ? out[i] / cnt[i] : 0
  return { width: w, height: h, data: out }
}
