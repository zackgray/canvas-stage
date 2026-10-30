import {
  Color, FloatType, NearestFilter, SRGBColorSpace, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer,
} from 'three'
import { createDepthMaterial } from './materials'
import { captureLayer, layered } from './surround'
import { withPickOverlaysHidden } from '../stage3d/kitPick'

// Offscreen renders read back to the CPU. All returned buffers are top row first (image order).

export interface Capture {
  width: number
  height: number
  /** sRGB-encoded RGBA8, exactly what the canvas would show */
  rgba: Uint8Array
  /** planar depth from the camera; 0 where nothing was drawn */
  depth: Float32Array
}

const depthMaterial = createDepthMaterial()

function flipRows<T extends Uint8Array | Float32Array>(src: T, width: number, height: number, channels: number): T {
  const out = new (src.constructor as new (n: number) => T)(src.length)
  const stride = width * channels
  for (let y = 0; y < height; y++) out.set(src.subarray(y * stride, (y + 1) * stride), (height - 1 - y) * stride)
  return out
}

/** Render with a fixed clear colour and no background, restoring renderer state afterwards. */
function withState<T>(renderer: WebGLRenderer, scene: Scene, clear: Color, alpha: number, fn: () => T): T {
  const prevColor = renderer.getClearColor(new Color())
  const prevAlpha = renderer.getClearAlpha()
  const prevTarget = renderer.getRenderTarget()
  const prevBackground = scene.background
  scene.background = null
  renderer.setClearColor(clear, alpha)
  try {
    return fn()
  } finally {
    scene.background = prevBackground
    renderer.setClearColor(prevColor, prevAlpha)
    renderer.setRenderTarget(prevTarget)
  }
}

/** The one place a capture draws: with the Surround far layer behind the set when the export asked for it (surround.ts),
 *  and the Stage pick overlays out of the scene (the stand-in at the mark, the pick's box; stage3d/kitPick.ts). */
function drawScene(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  withPickOverlaysHidden(scene, () => layered(renderer, scene, camera, captureLayer(scene), () => renderer.render(scene, camera), { clear: false }))
}

export function renderColor(
  renderer: WebGLRenderer, scene: Scene, camera: Camera, width: number, height: number,
  clear = new Color(0, 0, 0),
): Uint8Array {
  const rt = new WebGLRenderTarget(width, height, { colorSpace: SRGBColorSpace })
  const px = new Uint8Array(width * height * 4)
  withState(renderer, scene, clear, 1, () => {
    renderer.setRenderTarget(rt)
    renderer.clear()
    drawScene(renderer, scene, camera)
    renderer.readRenderTargetPixels(rt, 0, 0, width, height, px)
  })
  rt.dispose()
  return flipRows(px, width, height, 4)
}

export function renderDepth(
  renderer: WebGLRenderer, scene: Scene, camera: Camera, width: number, height: number,
): Float32Array {
  const rt = new WebGLRenderTarget(width, height, {
    type: FloatType, minFilter: NearestFilter, magFilter: NearestFilter,
  })
  const px = new Float32Array(width * height * 4)
  const prevOverride = scene.overrideMaterial
  withState(renderer, scene, new Color(0, 0, 0), 0, () => {
    scene.overrideMaterial = depthMaterial
    renderer.setRenderTarget(rt)
    renderer.clear()
    drawScene(renderer, scene, camera)
    renderer.readRenderTargetPixels(rt, 0, 0, width, height, px)
  })
  scene.overrideMaterial = prevOverride
  rt.dispose()
  const depth = new Float32Array(width * height)
  for (let i = 0; i < depth.length; i++) depth[i] = px[i * 4 + 3] > 0 ? px[i * 4] : 0
  return flipRows(depth, width, height, 1)
}

export function capture(
  renderer: WebGLRenderer, scene: Scene, camera: Camera, width: number, height: number, clear?: Color,
): Capture {
  return {
    width,
    height,
    rgba: renderColor(renderer, scene, camera, width, height, clear),
    depth: renderDepth(renderer, scene, camera, width, height),
  }
}
