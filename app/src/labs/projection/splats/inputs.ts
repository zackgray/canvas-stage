// Build splat inputs from the lab's own types (browser only: reads still pixels through a canvas).

import { Quaternion, Vector3, type PerspectiveCamera, type Texture } from 'three'
import { toRad } from '../math/camera'
import { sharpenEdges } from '../math/filters'
import { holeOnlyDepth } from '../math/settle'
import { SEAM_GROW, type ProjectorLayer } from '../engine/settled'
import type { ProjectionSource } from '../engine/Stage'
import { DEFAULT_SPLAT_OPTIONS, type DepthSplatSource, type SplatOptions } from './fromDepth'

export interface SplatLayerOptions extends Partial<SplatOptions> {
  /** 16-byte PackedSplats (half-float centres) instead of 32-byte ExtSplats (float32 centres) */
  packed?: boolean
}

/** Everything a SplatLayer needs: fromDepth's input plus the projector's world pose. */
export interface SplatInput extends DepthSplatSource {
  position: Vector3
  quaternion: Quaternion
  options?: SplatLayerOptions
}

/** A texture's pixels as RGBA8 top row first, resampled to width x height. */
export function texturePixels(texture: Texture, width: number, height: number): Uint8ClampedArray {
  const img = texture.image as (CanvasImageSource & { width: number; height: number }) | { data: ArrayLike<number>; width: number; height: number }
  const canvas = new OffscreenCanvas(width, height)
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  if ('data' in img) {
    // DataTexture: row 0 is uv v = 0, the bottom (see captureTexture); flip to top row first
    const { data, width: w, height: h } = img
    const top = new ImageData(w, h)
    for (let y = 0; y < h; y++) {
      const from = (h - 1 - y) * w * 4
      for (let x = 0; x < w * 4; x++) top.data[y * w * 4 + x] = data[from + x]
    }
    if (w === width && h === height) return top.data
    const tmp = new OffscreenCanvas(w, h)
    tmp.getContext('2d')!.putImageData(top, 0, 0)
    g.drawImage(tmp, 0, 0, width, height)
  } else {
    g.drawImage(img, 0, 0, width, height)
  }
  return g.getImageData(0, 0, width, height).data
}

function pose(camera: PerspectiveCamera) {
  camera.updateMatrixWorld(true)
  return { position: camera.getWorldPosition(new Vector3()), quaternion: camera.getWorldQuaternion(new Quaternion()) }
}

/** The original projector: `stage.source` (depth already cleaned by shotSource) and `stage.projector`. */
export function sourceInput(source: ProjectionSource, projector: PerspectiveCamera, options?: SplatLayerOptions): SplatInput {
  const width = source.depthWidth
  const height = source.depthHeight
  return {
    rgba: texturePixels(source.texture, width, height),
    depth: source.depth,
    width,
    height,
    vfov: toRad(projector.fov),
    ...pose(projector),
    options,
  }
}

/**
 * A settled projector, meshed exactly as ProjectorLayer does: soft edges snapped with the same `sharpen` radius,
 * depth kept only inside the hole mask grown by SEAM_GROW. Pass the grid's edge/planeAware in options.
 */
export function settledInput(layer: ProjectorLayer, sharpen: number, options?: SplatLayerOptions): SplatInput {
  const { meta, depth, holes, texture } = layer.view
  const { width, height } = meta
  const edge = options?.edgeThreshold ?? DEFAULT_SPLAT_OPTIONS.edgeThreshold
  const snapped = sharpenEdges(depth, width, height, sharpen, edge)
  return {
    rgba: texturePixels(texture, width, height),
    depth: holeOnlyDepth(snapped, holes, width, height, SEAM_GROW),
    width,
    height,
    vfov: toRad(meta.camera.vfovDeg),
    ...pose(layer.camera),
    options,
  }
}
