import type { Texture } from 'three'
import { toDepth, type DepthConvention, type DepthImage, type DepthParams } from '../math/depth'
import { conventionForEntry } from './manifest'
import { loadDepthImage, loadStill, type BankShot } from './sources'
import type { ProjectionSource } from './Stage'
import { dequantize, sharpenEdges } from '../math/filters'

export interface LoadedShot {
  shot: BankShot
  texture: Texture
  image: DepthImage
  convention: DepthConvention
  bits: number
  /** cached dequantized depth values (bilateral pass is the slow part) */
  smoothed?: Float32Array
}

export interface CleanUp {
  /** bilateral smoothing of 8-bit terraces */
  dequantize: boolean
  /** soft-edge snapping radius in px (0 = off) */
  sharpen: number
  /** relative jump treated as an edge, shared with the mesh cut */
  edge: number
}

export async function loadShot(shot: BankShot, depthIndex: number): Promise<LoadedShot> {
  const entry = shot.depths[depthIndex] ?? shot.depths[0]
  if (!entry) throw new Error(`shot ${shot.id} has no depth maps`)
  const [texture, image] = await Promise.all([loadStill(shot.image), loadDepthImage(entry.path)])
  return { shot, texture, image, convention: conventionForEntry(entry), bits: image.bits }
}

export function shotSource(s: LoadedShot, params: DepthParams, clean: CleanUp): ProjectionSource {
  const img = s.texture.image as { width?: number; height?: number } | undefined
  const { width, height } = s.image
  let values = s.image.values
  if (clean.dequantize && s.bits === 8) {
    values = s.smoothed ??= dequantize(values, width, height, 4, 2.5 / 255)
  }
  const depth = sharpenEdges(toDepth({ width, height, values }, s.convention, params), width, height, clean.sharpen, clean.edge)
  return {
    texture: s.texture,
    depth,
    depthWidth: s.image.width,
    depthHeight: s.image.height,
    width: img?.width || s.shot.width,
    height: img?.height || s.shot.height,
  }
}
