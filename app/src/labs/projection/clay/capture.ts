// One clay frame's three passes, exactly as experiments/e96_export.ts captured them (the proven clay's input):
//   colour   the world + performer render at 1920x1088, holes magenta (paintHoles), PNG
//   depth    planar depth, everything (Float32, top row first; 0 = nothing drawn)
//   bg       planar depth with the performer hidden (the person mask downstream = where the two differ)
// Every pass renders through stage.offscreenAt the frame's world time (the performance frame on the set, the car where the
// take saw it) inside withSurroundCapture (the far surround behind the set), from a fresh camera at the frame's pose and vfov.
import { PerspectiveCamera } from 'three'
import { renderColor, renderDepth } from '../engine/capture'
import type { Stage } from '../engine/Stage'
import { withSurroundCapture } from '../engine/surround'
import { encodePng } from '../math/png'
import { paintHoles, type WarpFrame, type WarpPlan } from '../performance/warpPlan'
import { CLAY_H, CLAY_W } from './plan'

export interface ClayPasses { colour: Uint8Array; depth: Float32Array; bg: Float32Array; holeShare: number }

export async function captureClayFrame(stage: Stage, f: WarpFrame, poses: WarpPlan['poses'][number], W = CLAY_W, H = CLAY_H): Promise<ClayPasses> {
  const cam = new PerspectiveCamera(40, W / H, stage.view.near, stage.view.far)
  cam.position.fromArray(f.position)
  cam.quaternion.fromArray(f.quaternion)
  cam.fov = f.vfovDeg
  cam.zoom = 1
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld(true)
  const perf = stage.world.performance?.object ?? null
  const out = withSurroundCapture(stage, () => stage.offscreenAt(f.t, () => {
    const rgba = renderColor(stage.renderer, stage.scene, cam, W, H)
    const depth = renderDepth(stage.renderer, stage.scene, cam, W, H)
    if (!perf) return { rgba, depth, bg: depth }
    const was = perf.visible
    perf.visible = false
    try { return { rgba, depth, bg: renderDepth(stage.renderer, stage.scene, cam, W, H) } } finally { perf.visible = was }
  }, poses))
  const { rgb, holeShare } = paintHoles(out.rgba, out.depth)
  const colour = await encodePng({ width: W, height: H, channels: 3, bitDepth: 8, data: rgb })
  return { colour, depth: out.depth, bg: out.bg, holeShare }
}
