// The Set's live scene (set viewport): one buildWorld(plan) shared by the render-camera and free panes, plus the mark's grey stand-in
// (the live views may show it; no offline render reads this scene). It knows each piece's root by its plan index (world.ts KIT_INDEX),
// so a pick, a drag in progress (a pose drawn before the save) and the picked piece's box all work on the built scene without a
// rebuild. A new plan builds a new LiveSet (SetViews); nothing here saves.
import { Box3, BoxHelper, Group, Vector3, type Object3D, type Raycaster, type Scene } from 'three'
import type { PerformancePlan, ScenePlan, World3D } from '../../../stage3d/contract'
import { markOf } from '../../../stage3d/mark'
import { startFacingDeg } from '../../../stage3d/motion/startFacing'
import { buildWorld, KIT_INDEX } from '../../../stage3d/world'
import { disposeFigure, markFigure } from '../../../labs/projection/stage3d/markFigure'

type Pt = [number, number]
/** what can be picked: a piece (its plan index) or the subject's mark */
export type SetPick = number | 'mark'
export interface Pose { at: Pt; yaw: number }
/** live poses by pick (`String(index)` or 'mark'): drawn instead of the plan's until the re-read plan shows them */
export type Poses = Readonly<Record<string, Pose>>
export const pickKey = (p: SetPick) => String(p)

interface Root { o: Object3D; at: Pt; yaw: number; y: number; rotX: number; rotY: number; rotZ: number }
const DEG = Math.PI / 180

export class LiveSet {
  readonly world: World3D
  readonly scene: Scene
  readonly plan: ScenePlan
  readonly figure: Group
  private roots = new Map<string, Root>()
  private box: BoxHelper | null = null
  private picked: SetPick | null = null
  private poses: Poses = {}
  /** the saved performance: the figure's front shows the way the take starts facing (a walk: its first leg; a stand: the mark) */
  private perf: Pick<PerformancePlan, 'path' | 'stand'> | null = null
  private listeners = new Set<() => void>()
  private gone = false

  constructor(plan: ScenePlan, build: (p: ScenePlan) => World3D = buildWorld) {
    this.plan = plan
    this.world = build(plan)
    this.scene = this.world.scene
    this.figure = markFigure(plan, this.world.groundAt, { front: true })
    this.scene.add(this.figure)
    const m = markOf(plan)
    this.roots.set('mark', { o: this.figure, at: m.at as Pt, yaw: m.yawDeg, y: this.figure.position.y, rotX: this.figure.rotation.x, rotY: this.figure.rotation.y, rotZ: this.figure.rotation.z })
    this.index()
    // generated pieces land later (glbPiece.ts): index them then, and draw again
    this.world.ready.then(() => { if (this.gone) return; this.index(); this.apply() }, () => {})
  }

  private index() {
    const visit = (o: Object3D) => {
      const i = o.userData[KIT_INDEX]
      if (typeof i === 'number') {
        const it = this.plan.kit[i]
        if (it && !this.roots.has(String(i))) this.roots.set(String(i), { o, at: [it.at[0], it.at[1]], yaw: it.yawDeg ?? 0, y: o.position.y, rotX: o.rotation.x, rotY: o.rotation.y, rotZ: o.rotation.z })
        return
      }
      if (o === this.scene || o.name === 'glb-pieces') o.children.forEach(visit)
    }
    visit(this.scene)
  }

  /** the root object of a pick (tests and the label read it) */
  objectOf(p: SetPick): Object3D | null { return this.roots.get(pickKey(p))?.o ?? null }

  /** where a pick stands now: its live pose, else the plan's */
  poseOf(p: SetPick): Pose | null {
    const live = this.poses[pickKey(p)]
    if (live) return live
    const r = this.roots.get(pickKey(p))
    return r ? { at: r.at, yaw: r.yaw } : null
  }

  /** the piece or mark under a ray (the pieces and the figure only: never the ground, the tufts or the sky) */
  pick(ray: Raycaster): SetPick | null { return this.hit(ray)?.pick ?? null }

  /** the piece or mark under a ray and the spot on it the ray meets (where a drag takes hold) */
  hit(ray: Raycaster): { pick: SetPick; spot: Vector3 } | null {
    const objs = [...this.roots.values()].map((r) => r.o)
    for (const hit of ray.intersectObjects(objs, true)) {
      for (let o: Object3D | null = hit.object; o; o = o.parent) {
        if (o === this.figure) return { pick: 'mark', spot: hit.point }
        const i = o.userData[KIT_INDEX]
        if (typeof i === 'number') return { pick: i, spot: hit.point }
      }
    }
    return null
  }

  /** draw these live poses (every other root back at the plan's place) */
  setPoses(poses: Poses) { this.poses = poses; this.apply() }

  /** the saved performance the figure's front follows (startFacingDeg); null: the mark's own facing */
  setPerf(perf: Pick<PerformancePlan, 'path' | 'stand'> | null) { this.perf = perf; this.apply() }

  /** the yaw a root is drawn at: a piece its pose's; the mark's figure the way the take starts facing from that pose */
  private shownYaw(k: string, r: Root, pose: Pose): number {
    if (k !== 'mark') return pose.yaw
    const moved = pose.at[0] !== r.at[0] || pose.at[1] !== r.at[1]
    return startFacingDeg(this.perf, pose.yaw, moved ? pose.at : undefined)
  }

  /** the picked piece gets a box (the label is the views' own) */
  select(p: SetPick | null) {
    this.picked = p
    this.box?.removeFromParent(); this.box?.dispose(); this.box = null
    const o = p === null ? null : this.objectOf(p)
    if (o) { this.box = new BoxHelper(o, 0xffc83c); this.scene.add(this.box) }
    this.changed()
  }

  get selected(): SetPick | null { return this.picked }

  /** the top of the picked piece (where its label sits), or null */
  labelPoint(): Vector3 | null {
    const o = this.picked === null ? null : this.objectOf(this.picked)
    if (!o) return null
    const b = new Box3().setFromObject(o)
    return b.isEmpty() ? null : new Vector3((b.min.x + b.max.x) / 2, b.max.y + 0.3, (b.min.z + b.max.z) / 2)
  }

  private apply() {
    const H = this.world.groundAt
    for (const [k, r] of this.roots) {
      const pose = this.poses[k] ?? { at: r.at, yaw: r.yaw }
      r.o.position.set(pose.at[0], r.y + H(pose.at[0], pose.at[1]) - H(r.at[0], r.at[1]), pose.at[1])
      // a live pose moves a piece's place and turn only; its built base tilt (pitch/roll, own axes, under the turn) stays
      r.o.rotation.order = 'YXZ'
      r.o.rotation.x = r.rotX
      r.o.rotation.z = r.rotZ
      r.o.rotation.y = r.rotY + (this.shownYaw(k, r, pose) - r.yaw) * DEG
      r.o.updateMatrixWorld(true)
    }
    this.box?.update()
    this.changed()
  }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private changed() { for (const fn of this.listeners) fn() }

  dispose() {
    this.gone = true
    this.listeners.clear()
    this.box?.dispose()
    disposeFigure(this.figure)
    this.world.dispose()
  }
}
