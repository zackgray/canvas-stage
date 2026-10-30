// The 3D performer (a CMU-mocap clay mannequin walking a PerformancePlan's ground path) as a world-clock layer: in the live view,
// every capture, the bg-depth pass (World.without hides it), the orbit pivot, the take cap and picking, exactly as a lifted
// performance pack is. Two seams the pack shape set:
// - WorldRoot.place writes the layer object's position and scale every frame, so the Performer3D's own object (posed in world
//   metres) hangs under a holder and only the holder is placed. A kit world is metric, so the root scale is 1 and the holder stays
//   at identity; the performer's own transforms are never touched by the stage.
// - take lock, perfStart, startKey and the world id read `layer.pack`: the mocap layer carries an honest pack-shaped descriptor
//   (fps 24, frames = ceil(duration * 24), id mocap-<hash of the PerformancePlan>, locationId = the kit world).
import { Group, Vector3 } from 'three'
import type { PerformancePlan, Performer3D } from '../../../stage3d/contract'
import type { ClockLayer } from '../world/World'
import { disposeTree } from '../../../stage3d/dispose'
import { planHash } from '../../../stage3d/planHash'

export const MOCAP_FPS = 24
export const MOCAP_LABEL = '3D performer'

/** What the pack readers see of the mocap performance: the PackTiming + id they need, and the fields the lab shows. */
export interface MocapPack {
  kind: 'mocap'
  id: string
  label: string
  /** the kit world it walks in (a loc- id) */
  locationId: string
  fps: number
  frames: number
  prompt: string
}

/** the performance's id (FNV-1a of the plan's motion); pure, in src/stage3d/planHash.ts, re-exported so every import holds */
export { planHash }

export function mocapPack(plan: PerformancePlan, worldId: string, duration: number): MocapPack {
  return {
    kind: 'mocap', id: `mocap-${planHash(plan)}`, label: MOCAP_LABEL, locationId: worldId, fps: MOCAP_FPS,
    frames: Math.max(1, Math.ceil(duration * MOCAP_FPS - 1e-9)), prompt: '',
  }
}

export const isMocapLayer = (l: unknown): l is MocapLayer => l instanceof MocapLayer

export class MocapLayer implements ClockLayer {
  /** the holder WorldRoot places; the performer's object is its only child */
  readonly object = new Group()
  readonly duration: number
  readonly pack: MocapPack
  readonly performer: Performer3D
  readonly plan: PerformancePlan
  private centre: Vector3 | null = null

  constructor(performer: Performer3D, plan: PerformancePlan, worldId: string) {
    this.performer = performer
    this.plan = plan
    this.duration = performer.duration
    this.pack = mocapPack(plan, worldId, performer.duration)
    this.object.name = 'mocap-holder'
    this.object.add(performer.object)
  }

  pose(t: number): void { this.performer.poseAt(t) }

  /** the orbit point: the middle of the path walked, at chest height (fixed for the whole clip) */
  pivot(): Vector3 | null {
    if (this.centre) return this.centre.clone()
    const n = 16, c = new Vector3()
    for (let i = 0; i <= n; i++) c.add(this.performer.anchorAt((this.duration * i) / n))
    c.divideScalar(n + 1).setY(c.y + 1.2)
    this.centre = c
    return c.clone()
  }

  /** the performer's chest at clock time t: where the figure stands then, at chest height (the same lift as the orbit point) */
  chestAt(t: number): Vector3 | null {
    const a = this.performer.anchorAt(Math.min(this.duration, Math.max(0, t)))
    return a.setY(a.y + 1.2)
  }

  /** lets the figure go un-freed (it is parked for reuse, performerCache) and takes the holder off the stage */
  release(): Performer3D {
    this.performer.object.removeFromParent()
    this.object.removeFromParent()
    return this.performer
  }

  /** frees the figure's geometries; its one shared clay stays */
  dispose() {
    disposeTree(this.object)
    this.object.removeFromParent()
  }
}
