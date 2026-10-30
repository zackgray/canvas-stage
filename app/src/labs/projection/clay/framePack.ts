// The pure half of a kit clay frame (tidy wave, CLAY): read-back pixels -> the PNG files the server and every depth reader
// expect, with no three and no DOM, so the same code runs in an encode worker (encode.worker.ts), on the main thread as the
// fallback, and in the tests. The colour is the 8-bit RGB final_NNN.png; the depth is the 16-bit grey zdepth_NNN.png in
// CLAY_DEPTH_UNIT_M (1 cm) units, top row first, 0 = nothing drawn. The depth arrives packed into RGBA8 by the GPU (kitDepth.ts
// PACK_FRAG: units' high byte in R, low byte in G) so the read-back is 8 MB, not a 33 MB float buffer; packMetresRgba8 is that
// shader's arithmetic in JS, the reference the GLSL is written to match.
import { CLAY_DEPTH_UNIT_M } from '../../../shared/shotContract'
import { encodePng } from '../math/png'

/** RGBA read bottom row first (gl.readPixels) -> RGB top row first (PNG order) */
export function rgbaBottomUpToRgb(px: Uint8Array, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H * 3)
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4, dst = y * W * 3
    for (let x = 0; x < W; x++) { out[dst + x * 3] = px[src + x * 4]; out[dst + x * 3 + 1] = px[src + x * 4 + 1]; out[dst + x * 3 + 2] = px[src + x * 4 + 2] }
  }
  return out
}

/** one planar distance in metres -> its 16-bit unit: round(d / unit), at least 1 for anything drawn, at most 65535; 0 = none */
export const metresToUnit = (d: number, unitM = CLAY_DEPTH_UNIT_M): number =>
  d > 0 && Number.isFinite(d) ? Math.min(65535, Math.max(1, Math.round(d / unitM))) : 0

/** The depth shader in JS: planar metres (RGBA float, metres in R, bottom row first) -> RGBA8, units' high byte in R, low in G. */
export function packMetresRgba8(rgba: Float32Array, W: number, H: number, unitM = CLAY_DEPTH_UNIT_M): Uint8Array {
  const out = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const u = metresToUnit(rgba[i * 4], unitM)
    out[i * 4] = u >> 8; out[i * 4 + 1] = u & 0xff; out[i * 4 + 3] = 255
  }
  return out
}

/** RGBA8-packed depth as read back (bottom row first) -> 16-bit units, top row first */
export function unpackDepthRgba8(px: Uint8Array, W: number, H: number): Uint16Array {
  const out = new Uint16Array(W * H)
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4, dst = y * W
    for (let x = 0; x < W; x++) out[dst + x] = (px[src + x * 4] << 8) | px[src + x * 4 + 1]
  }
  return out
}

/** 16-bit units -> a greyscale 16-bit PNG (the zdepth_NNN.png format) */
export const encodeDepthPng = (units: Uint16Array, W: number, H: number) => encodePng({ width: W, height: H, channels: 1, bitDepth: 16, data: units })

/** One image to encode: a colour read-back ('rgb': RGBA8 bottom-up) or a packed depth read-back ('depth16': RGBA8 bottom-up). */
export interface EncodeJob { kind: 'rgb' | 'depth16'; px: Uint8Array; width: number; height: number }

/** the job's PNG, exactly the bytes the main-thread path wrote before the encode moved off it */
export async function encodeJob(j: EncodeJob): Promise<Uint8Array> {
  if (j.px.length !== j.width * j.height * 4) throw new Error(`a ${j.width}x${j.height} read-back is ${j.width * j.height * 4} bytes, got ${j.px.length}`)
  return j.kind === 'rgb'
    ? encodePng({ width: j.width, height: j.height, channels: 3, bitDepth: 8, data: rgbaBottomUpToRgb(j.px, j.width, j.height) })
    : encodeDepthPng(unpackDepthRgba8(j.px, j.width, j.height), j.width, j.height)
}
