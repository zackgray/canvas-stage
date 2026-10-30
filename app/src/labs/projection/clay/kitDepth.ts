// The metric depth of a kit clay frame (the hero still's depth control): the scene rendered again, with its own
// materials, into a target with a float depth texture, then
// turned into PLANAR metres (camera z, the live CoC's distance) by a full-screen pass. Stored per frame as a 16-bit greyscale PNG
// at CLAY_DEPTH_UNIT_M (1 cm) per unit, top row first: 0 = nothing drawn (infinity), 65535 = at or past 655.34 m. Same 1920x1088
// as the clay frame it sits beside.
// (tidy wave) The full-screen pass rounds to units on the GPU and packs them into RGBA8 (high byte R, low byte G), so the read-back
// is 8 MB where the float target's was 33 MB, and it can be issued without blocking (renderPacked). framePack.ts unpacks it; its
// packMetresRgba8 is this shader in JS. The GPU divides in float32 where the old path divided the read-back float in float64: a
// distance within ~1e-4 cm of a half-centimetre can round the other way (1 unit, 1 cm); nothing else changes.
import {
  DepthTexture, FloatType, NearestFilter, RGBAFormat, ShaderMaterial, UnsignedByteType, WebGLRenderTarget,
  type PerspectiveCamera, type Scene, type WebGLRenderer,
} from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { CLAY_DEPTH_UNIT_M } from '../../../shared/shotContract'
import { encodeDepthPng as encodeDepth, metresToUnit, unpackDepthRgba8 } from './framePack'
import { CLAY_H, CLAY_W } from './plan'

const VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`
/** framePack.ts metresToUnit + packMetresRgba8 on the GPU: round(d / unit) in [1, 65535] for anything drawn, 0 for nothing */
export const PACK_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform float uNear;
  uniform float uFar;
  uniform float uUnit;
  void main() {
    float z = texelFetch(tDepth, ivec2(gl_FragCoord.xy), 0).r;
    float d = z >= 1.0 ? 0.0 : -perspectiveDepthToViewZ(z, uNear, uFar);
    float u = d > 0.0 ? clamp(floor(d / uUnit + 0.5), 1.0, 65535.0) : 0.0;
    float hi = floor(u / 256.0);
    gl_FragColor = vec4(hi / 255.0, (u - hi * 256.0) / 255.0, 0.0, 1.0);
  }`

/**
 * Planar metres as read back (RGBA float, bottom row first, metres in R, 0 = nothing drawn) -> 16-bit units, top row first:
 * round(d / unit), at least 1 for anything drawn, at most 65535. The reference the packed GPU path is tested against.
 */
export function metresToUnits(rgba: Float32Array, W: number, H: number, unitM = CLAY_DEPTH_UNIT_M): Uint16Array {
  const out = new Uint16Array(W * H)
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4, dst = y * W
    for (let x = 0; x < W; x++) out[dst + x] = metresToUnit(rgba[src + x * 4], unitM)
  }
  return out
}

/** 16-bit units -> a greyscale 16-bit PNG */
export const encodeDepthPng = (units: Uint16Array, W = CLAY_W, H = CLAY_H) => encodeDepth(units, W, H)

export interface MetricDepthPass {
  /** render the scene's depth through `cam` and return it as 16-bit units, top row first (blocks on the read-back) */
  render(scene: Scene, cam: PerspectiveCamera): Uint16Array
  /** draw now, read back without blocking: the packed RGBA8 units, bottom row first (framePack.ts unpackDepthRgba8) */
  renderPacked(scene: Scene, cam: PerspectiveCamera): Promise<Uint8Array>
  dispose(): void
}

/** A metric depth pass on a renderer (the capture renderer); its render targets are its own, the canvas is not touched. */
export function openMetricDepth(r: WebGLRenderer, W = CLAY_W, H = CLAY_H): MetricDepthPass {
  const scene = new WebGLRenderTarget(W, H, { depthTexture: new DepthTexture(W, H, FloatType), minFilter: NearestFilter, magFilter: NearestFilter })
  const packed = new WebGLRenderTarget(W, H, { type: UnsignedByteType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false })
  const mat = new ShaderMaterial({
    uniforms: { tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 100 }, uUnit: { value: CLAY_DEPTH_UNIT_M } },
    vertexShader: VERT, fragmentShader: PACK_FRAG,
  })
  const quad = new FullScreenQuad(mat)
  /** the depth and its packing pass; `packed` holds the frame after, the renderer's own target is put back */
  const draw = (s: Scene, cam: PerspectiveCamera) => {
    const prev = r.getRenderTarget()
    try {
      r.setRenderTarget(scene)
      r.clear()
      r.render(s, cam)
      mat.uniforms.tDepth.value = scene.depthTexture
      mat.uniforms.uNear.value = cam.near
      mat.uniforms.uFar.value = cam.far
      r.setRenderTarget(packed)
      quad.render(r)
    } finally { r.setRenderTarget(prev) }
  }
  return {
    render(s, cam) {
      draw(s, cam)
      const px = new Uint8Array(W * H * 4)
      r.readRenderTargetPixels(packed, 0, 0, W, H, px)
      return unpackDepthRgba8(px, W, H)
    },
    renderPacked(s, cam) {
      draw(s, cam)
      // a fresh buffer per frame: it is transferred to an encode worker and gone from this side
      return r.readRenderTargetPixelsAsync(packed, 0, 0, W, H, new Uint8Array(W * H * 4)) as Promise<Uint8Array>
    },
    dispose() {
      scene.depthTexture?.dispose()
      scene.dispose()
      packed.dispose()
      mat.dispose()
      quad.dispose()
    },
  }
}
