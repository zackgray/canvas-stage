// A kit world's finished clay frame (Stage3D, wave 2): the true geometry (kit meshes, its sky dome, its fog, its lights) and the
// 3D performer, rendered at 1920x1088 with the E114 spike's renderer settings (e114-spike/scene.js): antialias, pixel ratio 1,
// shadows on (PCF: three r186 maps PCFSoft to PCF, so the spike rendered PCF too), ACES Filmic tone mapping at exposure 1, sRGB
// output. Tone mapping only applies when three draws to a canvas (never into a render target), so the frames are drawn by a
// capture renderer of their own, on its own 1920x1088 canvas, and read back from it; the stage's live renderer is not touched.
// Every frame renders through stage.offscreenAt at the frame's world time (the performer posed there, gizmos out of the way).
// The kit is already clay grey, so this colour render IS the clay: no Python. Each frame's metric depth (kitDepth.ts) is rendered
// in the same moment (the hero still's depth control).
// (tidy wave) grab() draws and reads back now and hands both read-backs to the encode pool (encodePool.ts, off the main thread),
// so the next frame draws while this one encodes; the depth is read back packed and without blocking. Timing is kept per phase.
import { ACESFilmicToneMapping, NoToneMapping, PCFShadowMap, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from 'three'
import type { ClayTiming } from '../../../shared/shotContract'
import type { Stage } from '../engine/Stage'
import { openEncodePool } from './encodePool'
import { withIdMaterials, type Rgb } from './idPass'
import { openMetricDepth } from './kitDepth'
import { withPickOverlaysHidden } from '../stage3d/kitPick'
import type { WarpFrame, WarpPlan } from '../performance/warpPlan'
import { CLAY_H, CLAY_W } from './plan'

export { rgbaBottomUpToRgb } from './framePack'

/** the spike's look (e114-spike/scene.js), as the capture renderer is set */
export const KIT_LOOK = { toneMapping: ACESFilmicToneMapping, exposure: 1, shadowType: PCFShadowMap, outputColorSpace: SRGBColorSpace, pixelRatio: 1 } as const

type LookTarget = Pick<WebGLRenderer, 'setPixelRatio' | 'setSize' | 'shadowMap' | 'toneMapping' | 'toneMappingExposure' | 'outputColorSpace'>

/** Set a renderer to the spike's look at W x H. */
export function applyKitLook(r: LookTarget, W = CLAY_W, H = CLAY_H): void {
  r.setPixelRatio(KIT_LOOK.pixelRatio)
  r.setSize(W, H, false)
  r.shadowMap.enabled = true
  r.shadowMap.type = KIT_LOOK.shadowType
  r.toneMapping = KIT_LOOK.toneMapping
  r.toneMappingExposure = KIT_LOOK.exposure
  r.outputColorSpace = KIT_LOOK.outputColorSpace
}

/** a frame drawn and read back, its PNGs still encoding */
export interface Grabbed { png: Promise<Uint8Array>; z: Promise<Uint8Array> | null }

/** the capture's own phases (clayTiming.ts); the export adds the uploads, the waits and the wall time */
export type CaptureTiming = Required<Pick<ClayTiming, 'renderMs' | 'readbackMs' | 'depthReadbackMs' | 'encodeMs'>> & Pick<ClayTiming, 'encodeOn'>

export interface KitFrameCapture {
  /** one frame as a 1920x1088 RGB PNG */
  frame(stage: Stage, f: WarpFrame, pose: WarpPlan['poses'][number]): Promise<Uint8Array>
  /** the metric depth of the frame last rendered: a 16-bit greyscale PNG, planar centimetres (kitDepth.ts); absent = no depth */
  depth?(): Promise<Uint8Array>
  /** draw and read back now (synchronously), encode later: the next frame need not wait; absent = frame() then depth() */
  grab?(stage: Stage, f: WarpFrame, pose: WarpPlan['poses'][number]): Grabbed
  /** the frame's flat-colour ID pass (idPass.ts): a 1920x1088 RGB PNG, and the colour table of the entities in it; absent = no ID pass */
  idFrame?(stage: Stage, f: WarpFrame, pose: WarpPlan['poses'][number]): Promise<{ png: Uint8Array; colors: Record<string, Rgb> }>
  /** where this capture's time went so far; absent = not measured (a test's capture) */
  timing?(): CaptureTiming
  dispose(): void
}

/** A frame drawn and read back: grab() when the capture has it, else frame() then depth(), awaited (a test's capture). */
export async function grabFrame(cap: KitFrameCapture, stage: Stage, f: WarpFrame, pose: WarpPlan['poses'][number]): Promise<Grabbed> {
  if (cap.grab) return cap.grab(stage, f, pose)
  const png = await cap.frame(stage, f, pose)
  return { png: Promise.resolve(png), z: cap.depth ? Promise.resolve(await cap.depth()) : null }
}

const now = () => performance.now()

/** A capture renderer for a run of frames (one per export: the kit's buffers upload once); dispose it when done. */
export function openKitCapture(W = CLAY_W, H = CLAY_H): KitFrameCapture {
  const canvas = document.createElement('canvas')
  const r = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  applyKitLook(r, W, H)
  const gl = r.getContext()
  const zPass = openMetricDepth(r, W, H)
  const pool = openEncodePool()
  const t: CaptureTiming = { renderMs: 0, readbackMs: 0, depthReadbackMs: 0, encodeMs: 0 }
  let lastZ: Promise<Uint8Array> | null = null
  const encode = (kind: 'rgb' | 'depth16', px: Uint8Array) => pool.encode({ kind, px, width: W, height: H }).then((e) => { t.encodeMs += e.ms; return e.png })
  /** the canvas as drawn, read back into a fresh buffer (it is transferred to an encode worker) */
  const readCanvas = () => { const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px }
  const cameraAt = (stage: Stage, f: WarpFrame) => {
    const cam = new PerspectiveCamera(40, W / H, stage.view.near, stage.view.far)
    cam.position.fromArray(f.position)
    cam.quaternion.fromArray(f.quaternion)
    cam.fov = f.vfovDeg
    cam.zoom = 1
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld(true)
    return cam
  }
  const grab = (stage: Stage, f: WarpFrame, pose: WarpPlan['poses'][number]): Grabbed => {
    const cam = cameraAt(stage, f)
    let rgba: Uint8Array | null = null, packed: Promise<Uint8Array> | null = null
    // the pick overlays (the stand-in at the mark, the pick's box) never reach a clay frame, though they live in this scene
    withPickOverlaysHidden(stage.scene, () => stage.offscreenAt(f.t, () => {
      // the kit's sky dome is the background (a scene colour behind it would only show through gaps)
      const bg = stage.scene.background
      stage.scene.background = null
      try {
        let t0 = now()
        r.setRenderTarget(null)
        r.render(stage.scene, cam)
        t.renderMs += now() - t0; t0 = now()
        rgba = readCanvas()
        t.readbackMs += now() - t0; t0 = now()
        packed = zPass.renderPacked(stage.scene, cam) // same scene, same instant, same camera
        t.renderMs += now() - t0
        const t1 = now()
        packed.then(() => { t.depthReadbackMs += now() - t1 }, () => {})
      } finally { stage.scene.background = bg }
    }, pose))
    if (!rgba || !packed) throw new Error('the clay frame did not render')
    const z = (packed as Promise<Uint8Array>).then((px) => encode('depth16', px))
    z.catch(() => {}) // a caller that only wants the colour (the opening) never awaits it
    lastZ = z
    return { png: encode('rgb', rgba), z }
  }
  return {
    grab,
    frame: async (stage, f, pose) => grab(stage, f, pose).png,
    async idFrame(stage, f, pose) {
      const cam = cameraAt(stage, f)
      let colors: Record<string, Rgb> = {}, px: Uint8Array | null = null
      withPickOverlaysHidden(stage.scene, () => stage.offscreenAt(f.t, () => {
        const tm = r.toneMapping
        r.toneMapping = NoToneMapping
        try {
          r.setRenderTarget(null)
          colors = withIdMaterials(stage.scene, () => { r.render(stage.scene, cam); px = readCanvas() })
        } finally { r.toneMapping = tm }
      }, pose))
      if (!px) throw new Error('the ID pass did not render')
      return { png: await encode('rgb', px), colors }
    },
    async depth() {
      if (!lastZ) throw new Error('no frame rendered yet')
      return lastZ
    },
    timing: () => ({ ...t, encodeOn: pool.where() }),
    dispose() { pool.dispose(); zPass.dispose(); r.dispose(); r.forceContextLoss() },
  }
}
