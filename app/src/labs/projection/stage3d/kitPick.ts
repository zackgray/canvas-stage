// Picking and live poses on the lab stage's kit layer (the merged Stage, step 4): the Set's own pick-and-drag
// (src/studio/scene/live) brought to the lab's one viewport. A press's ray against KitLayer.meshes() resolves to a plan
// piece by walking up to its KIT_INDEX root (operator/focus/follow.ts' taggedAncestor pattern; the ground, tufts and sky
// resolve to nothing) or to the mark figure; live poses are drawn straight on the kit group (LiveSet.setPoses' pattern),
// so every pane of the one scene shows the drag at once. The grey mark stand-in lives here (the lab stage had none: the
// Set's live views have one, the stills never do); the stand-in and the selection box are pick overlays, not set pieces:
// they live in the one scene the captures render, so every capture draws through withPickOverlaysHidden (below).
import { Box3, BoxHelper, BufferGeometry, Float32BufferAttribute, LineDashedMaterial, LineLoop, Vector3, type Group, type Object3D, type Raycaster } from 'three'
import { KIT_INDEX } from '../../../stage3d/world'
import { markOf } from '../../../stage3d/mark'
import { MARK_FIGURE_NAME, MARK_WEDGE, disposeFigure, markFigure } from './markFigure'
import { GIZMO_NAME, MoveGizmo, type Axis } from './moveGizmo'
import type { KitLayer } from './KitLayer'

type Pt = [number, number]
/** what can be picked on the Stage: a piece (its plan index) or the subject's mark (the person) */
export type StagePick = { t: 'piece'; index: number } | { t: 'mark' }
export interface KitPose { at: Pt; yaw: number }
/** live poses by pick key (`String(index)` or 'mark'): drawn instead of the plan's until the re-read plan shows them */
export type KitPoses = Readonly<Record<string, KitPose>>
export const stagePickKey = (p: StagePick) => (p.t === 'mark' ? 'mark' : String(p.index))

/** the selection box's name: like the stand-in, a pick overlay the captures must never see (withPickOverlaysHidden) */
export const KIT_PICK_BOX_NAME = 'kit-pick-box'

/** the Add-here mark's dashed ring (layout wave L3): a pick overlay too, hidden from every capture like the box */
export const MARK_RING_NAME = 'stage-mark-ring'

/** KitPick's overlays, found in the scene by name: never drawn by a capture, whatever is picked when it runs. */
const PICK_OVERLAYS = [MARK_FIGURE_NAME, KIT_PICK_BOX_NAME, MARK_RING_NAME, GIZMO_NAME]

/**
 * Run one capture's draw with the pick overlays hidden from `scene` (the live scene holds them; a capture read from it
 * would show a grey figure at the mark, or the pick's box, beside the performer). Whatever was visible comes back after,
 * a throw included. The kit clay/hero capture (clay/kitCapture.ts) and every renderColor/renderDepth capture
 * (engine/capture.ts) draw through this; the master still builds its own world, so it never sees these.
 */
export function withPickOverlaysHidden<T>(scene: Object3D, fn: () => T): T {
  const hidden: Object3D[] = []
  for (const name of PICK_OVERLAYS) {
    const o = scene.getObjectByName(name)
    if (o && o.visible) { o.visible = false; hidden.push(o) }
  }
  try {
    return fn()
  } finally {
    for (const o of hidden) o.visible = true
  }
}

interface Root { o: Object3D; at: Pt; yaw: number; y: number; rotY: number }
const DEG = Math.PI / 180

export class KitPick {
  readonly layer: KitLayer
  readonly figure: Group
  /** the move arrows on the picked thing (Free and Top panes only: their own camera layer) */
  readonly gizmo = new MoveGizmo()
  private roots = new Map<string, Root>()
  private box: BoxHelper | null = null
  private ring: LineLoop | null = null
  private poses: KitPoses = {}
  private gone = false
  private readonly off: () => void
  /** the 3D performer standing on the mark (one person: a click on her is the mark), or null */
  private performer: Object3D | null = null
  private picked: StagePick | null = null

  constructor(layer: KitLayer) {
    this.layer = layer
    this.figure = markFigure(layer.plan, layer.groundAt, { front: true })
    layer.group.add(this.figure)
    // L3: the Add-here mark's dashed ring (a circle of segments, dashed material), a pick overlay like the box
    const pts: number[] = []
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6) }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
    this.ring = new LineLoop(geo, new LineDashedMaterial({ color: 0xc9d24a, dashSize: 0.16, gapSize: 0.12 }))
    this.ring.name = MARK_RING_NAME
    this.ring.computeLineDistances()
    this.ring.visible = false
    layer.group.add(this.ring)
    layer.group.add(this.gizmo.group)
    const m = markOf(layer.plan)
    this.roots.set('mark', { o: this.figure, at: [m.at[0], m.at[1]], yaw: m.yawDeg, y: this.figure.position.y, rotY: this.figure.rotation.y })
    this.index()
    // generated pieces land later (glbPiece.ts): index them then, and draw again
    layer.ready.then(() => { if (this.gone) return; this.index(); this.apply() }, () => {})
    // a plan applied in place (KitLayer.applyPlan): every root's plan place is re-read, the mark stand-in moves to the new mark
    this.off = layer.onApply(() => this.reread())
  }

  private reread() {
    const plan = this.layer.plan, m = markOf(plan)
    this.figure.position.set(m.at[0], this.layer.groundAt(m.at[0], m.at[1]), m.at[1])
    this.figure.rotation.y = m.yawDeg * DEG
    for (const [k, r] of this.roots) {
      const it = k === 'mark' ? null : plan.kit[Number(k)]
      const at: Pt = it ? [it.at[0], it.at[1]] : [m.at[0], m.at[1]]
      this.roots.set(k, { o: r.o, at, yaw: it ? it.yawDeg ?? 0 : m.yawDeg, y: r.o.position.y, rotY: r.o.rotation.y })
    }
    this.apply()
  }

  /** the Add-here mark: the dashed ring rides at the spot (on the ground); null clears it */
  setMark(at: Pt | null) {
    if (!this.ring) return
    if (!at) { this.ring.visible = false; return }
    const H = this.layer.groundAt
    this.ring.position.set(at[0], H(at[0], at[1]) + 0.03, at[1])
    this.ring.visible = true
  }

  private index() {
    const visit = (o: Object3D) => {
      const i = o.userData[KIT_INDEX]
      if (typeof i === 'number') {
        const it = this.layer.plan.kit[i]
        if (it && !this.roots.has(String(i))) this.roots.set(String(i), { o, at: [it.at[0], it.at[1]], yaw: it.yawDeg ?? 0, y: o.position.y, rotY: o.rotation.y })
        return
      }
      if (o === this.layer.group || o.name === 'glb-pieces') o.children.forEach(visit)
    }
    visit(this.layer.group)
  }

  /** the root object of a pick (the label and the box read it) */
  objectOf(p: StagePick): Object3D | null { return this.roots.get(stagePickKey(p))?.o ?? null }

  /** where a pick stands now: its live pose, else the plan's */
  poseOf(p: StagePick): KitPose | null {
    const live = this.poses[stagePickKey(p)]
    if (live) return live
    const r = this.roots.get(stagePickKey(p))
    return r ? { at: [r.at[0], r.at[1]], yaw: r.yaw } : null
  }

  /**
   * The 3D performer on the mark: she is the person, so a click on her picks the mark, and the grey stand-in hides but for its
   * ground wedge (her facing, under her feet). null shows the whole stand-in again, unless she is still `coming` (her figure is
   * loading): then only the wedge shows where she will stand, so no grey capsule stands in for her first. The stand-in stays
   * pickable either way (a ray meets hidden meshes), so the mark can be clicked and dragged while she loads.
   */
  setPerformer(o: Object3D | null, coming = false) {
    this.performer = o
    for (const c of this.figure.children) c.visible = (!o && !coming) || !!c.userData[MARK_WEDGE]
    this.select(this.picked)
  }

  /** the piece or mark under a ray and the spot on it the ray meets (where a drag takes hold); the ground and sky miss */
  hit(ray: Raycaster): { pick: StagePick; spot: Vector3 } | null {
    const her: Object3D[] = []
    this.performer?.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh && o.visible) her.push(o) })
    for (const h of ray.intersectObjects([...this.layer.meshes(), ...her], false)) {
      for (let o: Object3D | null = h.object; o; o = o.parent) {
        if (o.name === MARK_FIGURE_NAME || o === this.performer) return { pick: { t: 'mark' }, spot: h.point }
        const i = o.userData[KIT_INDEX]
        if (typeof i === 'number') return { pick: { t: 'piece', index: i }, spot: h.point }
      }
    }
    return null
  }

  /** draw these live poses (every other root back at the plan's place) */
  setPoses(poses: KitPoses) { this.poses = poses; this.apply() }

  /** the picked thing gets a box (the floating name is the hook's own) */
  select(p: StagePick | null) {
    this.picked = p
    this.box?.removeFromParent(); this.box?.dispose(); this.box = null
    const o = p === null ? null : p.t === 'mark' && this.performer ? this.performer : this.objectOf(p)
    if (o) { this.box = new BoxHelper(o, 0xffc83c); this.box.name = KIT_PICK_BOX_NAME; this.layer.group.add(this.box) }
    this.placeGizmo()
  }

  /** the arrows stand on the picked thing as it is drawn now (its live pose, size and height); called every frame */
  placeGizmo() {
    const p = this.picked, o = p ? this.objectOf(p) : null
    if (!p || !o) { this.gizmo.show(null, 0, []); return }
    const b = new Box3().setFromObject(p.t === 'mark' && this.performer ? this.performer : o)
    const size = b.isEmpty() ? 1 : Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.75
    this.gizmo.show(new Vector3(o.position.x, o.position.y + 0.03, o.position.z), size, p.t === 'mark' ? ['x', 'z'] : ['x', 'y', 'z'])
  }

  /** the arrow under a ray (cast with the gizmo's layer), or null */
  hitGizmo(cast: Raycaster): Axis | null { return this.gizmo.hit(cast) }

  /** the top of the picked thing (where its label sits), or null */
  labelPoint(): Vector3 | null {
    const o = this.box === null ? null : (this.box.object as Object3D)
    if (!o) return null
    const b = new Box3().setFromObject(o)
    return b.isEmpty() ? null : new Vector3((b.min.x + b.max.x) / 2, b.max.y + 0.3, (b.min.z + b.max.z) / 2)
  }

  private apply() {
    const H = this.layer.groundAt
    for (const [k, r] of this.roots) {
      const pose = this.poses[k] ?? { at: r.at, yaw: r.yaw }
      r.o.position.set(pose.at[0], r.y + H(pose.at[0], pose.at[1]) - H(r.at[0], r.at[1]), pose.at[1])
      r.o.rotation.y = r.rotY + (pose.yaw - r.yaw) * DEG
      r.o.updateMatrixWorld(true)
    }
    this.box?.update()
  }

  dispose() {
    this.gone = true
    this.off()
    this.select(null)
    this.gizmo.dispose()
    this.setMark(null)
    this.ring?.removeFromParent()
    this.ring?.geometry.dispose()
    ;(this.ring?.material as LineDashedMaterial | undefined)?.dispose()
    this.ring = null
    disposeFigure(this.figure)
    this.figure.removeFromParent()
  }
}
