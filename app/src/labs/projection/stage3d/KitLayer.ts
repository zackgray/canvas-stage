// A kit world on the lab stage: the built World3D's contents (terrain, kit pieces, its lights, the far sky dome) moved out of its
// own Scene into one group that sits straight in the stage's scene, so the live view, every capture (renderColor / renderDepth /
// offscreen) and picking see it as the set. Fog lives on the scene being drawn, not on a nested one, so the stage takes the
// kit's FogExp2 while the kit is on (StageScene.setKit). The world is not under the WorldRoot: a kit world is metric (scale 1).
// A plan that differs only in where pieces stand, turn, size or lift (and the mark) is applied in place (applyPlan): the same
// objects move, so nothing is rebuilt and no generated piece reloads (a rebuild made every pane blink on each edit).
import { Group, type Fog, type FogExp2, type Mesh, type Object3D } from 'three'
import type { KitItem, PerformancePlan, ScenePlan, World3D } from '../../../stage3d/contract'
import { movePoseAt, moveSeconds, pieceTurnDeg } from '../../../stage3d/propMove'
import { KIT_INDEX } from '../../../stage3d/world'

/**
 * What a rebuild needs: the plan without each piece's place, turn, tilt, size, lift, words and travel, and without the mark. Two
 * plans with the same key differ only in what applyPlan sets in place.
 */
export function structuralKey(plan: ScenePlan): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const kit = plan.kit.map(({ at, yawDeg, pitchDeg, rollDeg, scale, lift, label, move, ...rest }) => rest)
  return JSON.stringify({ ...plan, mark: null, kit })
}

const DEG = Math.PI / 180

/** userData flag on the sky dome: drawn at the far plane, never picked (wave 2's depth passes can find it by this) */
export const KIT_SKY = 'stage3dSky'

export class KitLayer {
  readonly group = new Group()
  readonly fog: Fog | FogExp2 | null
  /** the far sky dome (a 1000 m sphere whose vertex shader pins depth to the far plane) */
  readonly sky: Mesh | null
  readonly ready: Promise<void>
  readonly groundAt: (x: number, z: number) => number
  readonly worldId: string
  readonly perf: PerformancePlan
  private current: ScenePlan
  private readonly disposeWorld: () => void
  private readonly applied = new Set<() => void>()

  constructor(world: World3D, worldId: string, plan: ScenePlan, perf: PerformancePlan) {
    this.worldId = worldId
    this.current = plan
    this.perf = perf
    this.group.name = `kit-${worldId}`
    this.fog = world.scene.fog
    world.scene.fog = null
    const kids = [...world.scene.children]
    for (const k of kids) this.group.add(k)
    this.sky = (kids.find((k) => (k as Mesh).isMesh && (k as Mesh).geometry?.type === 'SphereGeometry' && k.renderOrder < 0) as Mesh | undefined) ?? null
    if (this.sky) this.sky.userData[KIT_SKY] = true
    this.ready = world.ready
    this.groundAt = world.groundAt
    this.disposeWorld = () => world.dispose()
  }

  /** the plan the layer shows now (applyPlan moves it on) */
  get plan(): ScenePlan { return this.current }

  /** listen for in-place plan changes (the pick re-reads its roots); returns the unsubscribe */
  onApply(fn: () => void): () => void { this.applied.add(fn); return () => { this.applied.delete(fn) } }

  /**
   * Move every placed piece to `plan` in place: its spot on the ground, lift, turn, base tilt and size, as buildWorld and placeGlb
   * put them; a travelling piece is posed at the start of its path (t = 0). Only for a plan with this layer's structuralKey
   * (useKit rebuilds otherwise).
   */
  applyPlan(plan: ScenePlan) {
    this.current = plan
    const visit = (o: Object3D) => {
      if (typeof o.userData[KIT_INDEX] === 'number') return this.place(o, plan.kit[o.userData[KIT_INDEX] as number], 0)
      if (o === this.group || o.name === 'glb-pieces') o.children.forEach(visit)
    }
    visit(this.group)
    for (const fn of this.applied) fn()
  }

  /** seconds the longest piece travel on this plan lasts; the world's clock runs that long so a take can cover the drive */
  get moveDuration(): number { return this.current.kit.reduce((d, it) => Math.max(d, moveSeconds(it)), 0) }

  /**
   * The world's clock hook (prop-movement wave): pose every travelling piece at take time t — its ground point and the travel
   * heading on top of its base turn; its base tilt stays under the heading. Pieces without a `move` are untouched (applyPlan
   * placed them); t past the travel holds the path's end.
   */
  poseAt(t: number) {
    for (const o of this.group.children) this.poseMoving(o, t)
  }

  private poseMoving(o: Object3D, t: number) {
    if (typeof o.userData[KIT_INDEX] === 'number') {
      const it = this.current.kit[o.userData[KIT_INDEX] as number]
      if (it?.move) this.place(o, it, t)
      return
    }
    if (o === this.group || o.name === 'glb-pieces') o.children.forEach((c) => this.poseMoving(c, t))
  }

  /** place one piece root like buildWorld/placeGlb do, with `t` posing its travel (null = resting place) */
  private place(o: Object3D, it: KitItem | undefined, t: number | null) {
    if (!it) return
    const H = this.groundAt, g = it.glb
    const pose = t === null ? null : movePoseAt(it, t)
    const px = pose?.at[0] ?? it.at[0], pz = pose?.at[1] ?? it.at[1]
    o.position.set(px, H(px, pz) + (it.lift ?? 0) - (g?.sink ?? 0), pz)
    // the turn, then the base tilt, each about the model's own axes: yaw (Y), pitch (own X), roll (own Z), Euler order 'YXZ'
    o.rotation.order = 'YXZ'
    o.rotation.y = pieceTurnDeg(it, pose) * DEG
    o.rotation.x = (it.pitchDeg ?? 0) * DEG
    o.rotation.z = (it.rollDeg ?? 0) * DEG
    o.scale.setScalar((g?.unitScale ?? 1) * (it.scale ?? 1))
    o.updateMatrixWorld(true)
  }

  /** the placed root of plan piece `index` (a generated piece's only once its mesh has landed), or null */
  rootOf(index: number): Object3D | null {
    let found: Object3D | null = null
    const visit = (o: Object3D) => {
      if (found) return
      if (o.userData[KIT_INDEX] === index) { found = o; return }
      if (o === this.group || o.name === 'glb-pieces') o.children.forEach(visit)
    }
    visit(this.group)
    return found
  }

  /** what a click or the frame centre can land on: the visible kit meshes, not the sky */
  meshes(): Object3D[] {
    const out: Object3D[] = []
    this.group.traverse((o) => { if ((o as Mesh).isMesh && o.visible && !o.userData[KIT_SKY]) out.push(o) })
    return out
  }

  dispose() {
    // the world frees what it made (geometries, its own materials and the sky's texture, lights and their shadow maps, the tufts
    // InstancedMesh); the kit's shared module-level materials stay for the next world
    this.applied.clear()
    this.disposeWorld()
    this.group.removeFromParent()
  }
}
