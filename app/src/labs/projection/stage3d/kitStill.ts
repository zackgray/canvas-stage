// A kit world's master still, rendered here in the browser (the server has no GPU path for it): the world alone, no performer,
// from the master camera (server/stage3d/master.ts, the stage's default projector) at 1920 x 1088, shadows on, once the sky
// texture has loaded. Perform's staging, the world card and the source list show it.
import { PCFShadowMap, PerspectiveCamera, WebGLRenderer } from 'three'
import type { ScenePlan } from '../../../stage3d/contract'
import { buildWorld } from '../../../stage3d/world'
import { encodeDepthPng, openMetricDepth } from '../clay/kitDepth'
import { disposeFigure, markFigure } from './markFigure'
import { KIT_MASTER_POSITION, KIT_MASTER_TARGET, KIT_STILL_H, KIT_STILL_W, kitVfovDeg } from '../../../../server/stage3d/master'

export function masterCamera(groundAt: (x: number, z: number) => number = () => 0): PerspectiveCamera {
  const cam = new PerspectiveCamera(kitVfovDeg(), KIT_STILL_W / KIT_STILL_H, 0.05, 3000)
  const [px, py, pz] = KIT_MASTER_POSITION, [tx, ty, tz] = KIT_MASTER_TARGET
  cam.position.set(px, py + groundAt(px, pz), pz)
  cam.lookAt(tx, ty + groundAt(tx, tz), tz)
  cam.updateMatrixWorld(true)
  return cam
}

/** The master still of `plan` as a PNG blob: the world alone, plus a plain grey stand-in at the subject's mark (markFigure.ts; `figure: false` leaves it out). */
export async function renderKitStill(plan: ScenePlan, opts: { figure?: boolean } = {}): Promise<Blob> {
  const world = buildWorld(plan)
  await world.ready
  const figure = opts.figure === false ? null : markFigure(plan, world.groundAt)
  if (figure) world.scene.add(figure)
  const canvas = document.createElement('canvas')
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  try {
    renderer.setPixelRatio(1)
    renderer.setSize(KIT_STILL_W, KIT_STILL_H, false)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFShadowMap
    renderer.render(world.scene, masterCamera(world.groundAt))
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
    if (!blob) throw new Error('the browser could not encode the still')
    return blob
  } finally {
    if (figure) disposeFigure(figure)
    world.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

/** (set viewport) the world the master depth is measured on: the plan's world alone, never the mark's stand-in (a test holds this) */
export const masterDepthWorld = (plan: ScenePlan) => buildWorld(plan)

/**
 * The master view's metric depth (plan §3.3 "Master": the Bible master is drawn on it), rendered as the kit clay's zdepth is
 * (kitDepth.ts: planar centimetres, 16-bit grey, sky dome included), from the same master camera at the still's size. The mark's
 * stand-in figure is NOT in it (the still adds it, this never does): no person-shaped depth asks the master to draw a person.
 */
export async function renderKitMasterDepth(plan: ScenePlan): Promise<Blob> {
  const world = masterDepthWorld(plan)
  await world.ready
  const renderer = new WebGLRenderer({ canvas: document.createElement('canvas') })
  const pass = openMetricDepth(renderer, KIT_STILL_W, KIT_STILL_H)
  try {
    const units = pass.render(world.scene, masterCamera(world.groundAt))
    const png = await encodeDepthPng(units, KIT_STILL_W, KIT_STILL_H)
    return new Blob([png as BlobPart], { type: 'image/png' })
  } finally {
    pass.dispose()
    world.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
