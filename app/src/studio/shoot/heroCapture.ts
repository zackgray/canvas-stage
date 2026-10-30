// The take's opening frame (frame 0: the world + the performer, from the take's start camera, 1920x1088), drawn the way the
// E96 export draws frame 0 colour (and warpExport.ts every frame): offscreenAt the frame's world time under the surround
// capture, one colour and one depth pass, holes painted magenta. Reads the stage; changes nothing on it. On a kit world it is
// the kit clay's own frame 0 (kitCapture.ts): grey true geometry at the spike's look, what the kit hero prompt describes.
import { PerspectiveCamera } from 'three'
import type { PerformancePack } from '../../project/performance'
import type { TakeRecord } from '../../shared/shotContract'
import { renderColor, renderDepth } from '../../labs/projection/engine/capture'
import type { Stage } from '../../labs/projection/engine/Stage'
import { withSurroundCapture } from '../../labs/projection/engine/surround'
import { worldMismatch } from '../../labs/projection/clay/exportClay'
import { takeName } from './takeKeeps'
import { openKitCapture, type KitFrameCapture } from '../../labs/projection/clay/kitCapture'
import { encodePng } from '../../labs/projection/math/png'
import { paintHoles, planWarp, type WarpFrame, type WarpPlan } from '../../labs/projection/performance/warpPlan'

export const OPENING_W = 1920
export const OPENING_H = 1088

/** The take's frame 0 as the CrossView warp plans it (camera, lens at the frame's aspect, world time, car poses). */
export function openingPlan(take: Pick<TakeRecord, 'samples' | 'perfStart' | 'viewAspect'>, pack: Pick<PerformancePack, 'fps' | 'frames'>): { frame: WarpFrame; pose: WarpPlan['poses'][number] } {
  const plan = planWarp({ smoothed: take.samples, timelineStart: take.perfStart / pack.fps, viewAspect: take.viewAspect }, pack, OPENING_W / OPENING_H, 9)
  return { frame: plan.frames[0], pose: plan.poses[0] }
}

/** Why the opening cannot be drawn now (the set shows another world, or the take's performance is not on the set), or null. */
export function openingBlock(stage: Stage | null, take: Pick<TakeRecord, 'packId' | 'worldId'> & Partial<Pick<TakeRecord, 'id' | 'name' | 'perf' | 'set'>>, worldId: string): string | null {
  if (!stage) return 'The stage is not ready.'
  const world = worldMismatch(take, worldId)
  if (world) return world
  const on = (stage.world.performance as { pack?: PerformancePack } | null)?.pack
  // a take with a walk or set of its own is being put on the stage by the pick: say so, not "put it back"
  const loading = take.id && (take.perf || take.set) ? `Loading ${takeName({ id: take.id, name: take.name })}'s walk and set…` : null
  if (!on) return loading ?? 'Put the take\'s performance on the set first.'
  if (take.packId && on.id !== take.packId) return (take.perf ? loading : null) ?? 'The performance on the set is not the one this take was filmed with.'
  return null
}

/** A kit world's opening: frame 0 exactly as its clay draws it (kitCapture.ts, the spike's look), so the still is made from the clay's own opening. */
async function kitOpening(stage: Stage, f: WarpFrame, pose: WarpPlan['poses'][number], open: () => KitFrameCapture = openKitCapture): Promise<Blob> {
  const cap = open()
  try { return new Blob([(await cap.frame(stage, f, pose)) as BlobPart], { type: 'image/png' }) } finally { cap.dispose() }
}

export async function captureOpening(stage: Stage, take: TakeRecord, worldId: string): Promise<Blob> {
  const why = openingBlock(stage, take, worldId)
  if (why) throw new Error(why)
  const pack = (stage.world.performance as unknown as { pack: PerformancePack }).pack
  const { frame: f, pose } = openingPlan(take, pack)
  if (stage.kit) return kitOpening(stage, f, pose)
  const cam = new PerspectiveCamera(40, OPENING_W / OPENING_H, stage.view.near, stage.view.far)
  cam.position.fromArray(f.position)
  cam.quaternion.fromArray(f.quaternion)
  cam.fov = f.vfovDeg
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld(true)
  const { rgba, depth } = withSurroundCapture(stage, () => stage.offscreenAt(f.t, () => ({
    rgba: renderColor(stage.renderer, stage.scene, cam, OPENING_W, OPENING_H),
    depth: renderDepth(stage.renderer, stage.scene, cam, OPENING_W, OPENING_H),
  }), pose))
  const { rgb } = paintHoles(rgba, depth)
  const png = await encodePng({ width: OPENING_W, height: OPENING_H, channels: 3, bitDepth: 8, data: rgb })
  return new Blob([png as BlobPart], { type: 'image/png' })
}
