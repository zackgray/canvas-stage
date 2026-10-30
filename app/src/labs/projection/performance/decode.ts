// One performance frame decoded once, kept small (pure; Node + browser): the pack's colour, 16-bit planar actor depth and
// actor mask, cropped to the actors' bounding box (+1 px). Only the actors become geometry, so nothing outside the box
// is kept: memory scales with the actors' area, not the frame's. Depth stays the pack's raw 16-bit values (metres only
// when a frame is meshed: `cropMetres`), half of what Float32 would hold.
import { DEPTH_ENCODING, depthMetres, type PerformancePack } from '../../../project/performance'
import { decodePng, type PngImage } from '../math/png'

export interface ActorCrop {
  /** frame index in the pack */
  index: number
  /** the crop's top-left in the full frame (px) and its size; w = h = 0: no actors in this frame */
  x0: number
  y0: number
  w: number
  h: number
  /** sRGB RGBA8 of the crop, top row first (the layer hands it to the frame's texture) */
  rgba: Uint8Array
  /** the pack's raw depth values of the crop, top row first; 0 = no actor (metres = value · metersPerUnit) */
  depth: Uint16Array
  metersPerUnit: number
}

/** Bytes a crop holds on the CPU. */
export const cropBytes = (c: ActorCrop) => c.rgba.byteLength + c.depth.byteLength

/** The crop's planar depth in metres (lab units), 0 off the actors. */
export function cropMetres(c: ActorCrop): Float32Array {
  const out = new Float32Array(c.depth.length)
  const pack: Pick<PerformancePack, 'depth'> = { depth: { encoding: DEPTH_ENCODING, metersPerUnit: c.metersPerUnit } }
  for (let i = 0; i < out.length; i++) out[i] = c.depth[i] > 0 ? depthMetres(c.depth[i], pack) : 0
  return out
}

const sample = (img: PngImage, i: number, c: number) => {
  const v = img.data[i * img.channels + Math.min(c, img.channels - 1)]
  return img.bitDepth === 16 ? v >> 8 : v
}

/**
 * Crop one frame to its actors: a pixel is an actor where the mask is set (> half) and the depth is > 0. `depth` must be
 * 16-bit grey (`planar-metres-16bit`: value · metersPerUnit = planar depth); all three must be width × height.
 */
export function cropActors(index: number, color: PngImage, depth: PngImage, mask: PngImage, metersPerUnit: number): ActorCrop {
  const { width: W, height: H } = color
  for (const [name, img] of [['depth', depth], ['mask', mask]] as const) {
    if (img.width !== W || img.height !== H) throw new Error(`frame ${index}: ${name} is ${img.width}×${img.height}, colour ${W}×${H}`)
  }
  if (depth.bitDepth !== 16) throw new Error(`frame ${index}: depth must be 16-bit (planar-metres-16bit)`)
  const half = mask.bitDepth === 16 ? 32768 : 128
  const actor = (i: number) => mask.data[i * mask.channels] >= half && depth.data[i * depth.channels] > 0
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!actor(y * W + x)) continue
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  if (x1 < 0) return { index, x0: 0, y0: 0, w: 0, h: 0, rgba: new Uint8Array(0), depth: new Uint16Array(0), metersPerUnit }
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1)
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const rgba = new Uint8Array(w * h * 4)
  const d = new Uint16Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y + y0) * W + x + x0, o = y * w + x
    for (let c = 0; c < 3; c++) rgba[o * 4 + c] = sample(color, i, c)
    rgba[o * 4 + 3] = 255
    d[o] = actor(i) ? depth.data[i * depth.channels] : 0
  }
  return { index, x0, y0, w, h, rgba, depth: d, metersPerUnit }
}

/** Decode a frame's three PNGs and crop it. */
export async function decodeActorFrame(index: number, color: Uint8Array, depth: Uint8Array, mask: Uint8Array, metersPerUnit: number): Promise<ActorCrop> {
  const [c, d, m] = await Promise.all([decodePng(color), decodePng(depth), decodePng(mask)])
  return cropActors(index, c, d, m, metersPerUnit)
}
