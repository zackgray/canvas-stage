import type { Texture } from 'three'

/** What gets projected: an sRGB still and planar depth (top row first) on a grid of its own size. */
export interface ProjectionSource {
  texture: Texture
  depth: Float32Array
  depthWidth: number
  depthHeight: number
  /** still resolution, used for exports */
  width: number
  height: number
}
