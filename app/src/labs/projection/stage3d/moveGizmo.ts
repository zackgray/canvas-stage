// The Stage's move gizmo (the Stage simplification, step 12): three world-axis arrows on the picked thing — X (red) and Z (blue)
// along the ground, Y (green) up for a piece's height. Dragging an arrow moves the thing along that axis only. It lives on its own
// camera layer, which only the Free and Top panes' cameras see: the Camera pane and every capture (drawn with the view camera)
// never show it. A pick overlay like the box: it is never a set piece. It keeps one size on screen in each pane, whatever the
// size of the thing it stands on (owner 2026-10-29: on a grandstand grown to tens of metres the arrows outgrew the scene): each
// pane's draw sizes it for that pane's camera just before it is drawn, and a press sizes it for the camera it was cast from.
import { ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Vector3, type Camera, type OrthographicCamera, type PerspectiveCamera, type Ray } from 'three'

export type Axis = 'x' | 'y' | 'z'
/** the camera layer the gizmo draws on (the Free and Top panes enable it; the view camera never does) */
export const GIZMO_LAYER = 5
export const GIZMO_NAME = 'stage-gizmo'
export const AXIS_DIR: Record<Axis, Vector3> = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) }
const COLOR: Record<Axis, number> = { x: 0xe5534b, y: 0x57ab5a, z: 0x539bf5 }
/** an arrow's length as a share of its pane's height */
export const GIZMO_SCREEN = 0.14

/** the arrow length (m) that shows GIZMO_SCREEN of the pane's height when the gizmo stands at `at`, for this camera */
export function gizmoSizeFor(camera: Camera, at: Vector3): number {
  const o = camera as OrthographicCamera
  if (o.isOrthographicCamera) return ((o.top - o.bottom) / (o.zoom || 1)) * GIZMO_SCREEN
  const p = camera as PerspectiveCamera
  const dist = Math.max(0.01, camera.getWorldPosition(new Vector3()).distanceTo(at))
  return 2 * dist * Math.tan(((p.fov ?? 50) * Math.PI) / 360) * GIZMO_SCREEN / (p.zoom || 1)
}

/** one arrow along +axis, length 1 (the group is scaled to the thing), with a fatter invisible shaft that is easy to grab */
function arrow(axis: Axis): Group {
  const g = new Group()
  const mat = new MeshBasicMaterial({ color: COLOR[axis], depthTest: false, transparent: true, opacity: 0.95 })
  const shaft = new Mesh(new CylinderGeometry(0.018, 0.018, 0.8, 8), mat)
  const tip = new Mesh(new ConeGeometry(0.06, 0.2, 12), mat)
  const grab = new Mesh(new CylinderGeometry(0.09, 0.09, 1, 6), new MeshBasicMaterial({ visible: false }))
  shaft.position.y = 0.4; tip.position.y = 0.9; grab.position.y = 0.5
  // never culled by the size of the last pane's draw: each draw sizes it first (MoveGizmo.fit)
  for (const m of [shaft, tip, grab]) { m.userData.axis = axis; m.renderOrder = 999; m.frustumCulled = false; m.layers.set(GIZMO_LAYER); g.add(m) }
  if (axis === 'x') g.rotation.z = -Math.PI / 2
  if (axis === 'z') g.rotation.x = Math.PI / 2
  return g
}

export class MoveGizmo {
  readonly group = new Group()
  private readonly arrows: Record<Axis, Group>

  constructor() {
    this.group.name = GIZMO_NAME
    this.arrows = { x: arrow('x'), y: arrow('y'), z: arrow('z') }
    for (const a of Object.values(this.arrows)) this.group.add(a)
    this.group.visible = false
    // the Free and Top panes draw the same scene through their own cameras: size the arrows for each one as it draws them
    this.group.traverse((o) => { if (o instanceof Mesh) o.onBeforeRender = (_r, _s, camera) => this.fit(camera) })
  }

  /** one size on screen for this camera (its matrices are the ones about to draw or cast) */
  fit(camera: Camera) {
    const s = gizmoSizeFor(camera, this.group.position)
    if (Math.abs(this.group.scale.x - s) < 1e-6) return
    this.group.scale.setScalar(s)
    this.group.updateMatrixWorld(true)
  }

  /** stand on `at` (the thing's ground point), with these axes (the person has no height: no Y); `size` (m) is its length until
   *  a pane draws it or a press is cast at it (fit), held to a few metres */
  show(at: Vector3 | null, size: number, axes: readonly Axis[]) {
    this.group.visible = !!at
    if (!at) return
    this.group.position.copy(at)
    this.group.scale.setScalar(Math.min(3, Math.max(0.6, size)))
    for (const a of ['x', 'y', 'z'] as const) this.arrows[a].visible = axes.includes(a)
    this.group.updateMatrixWorld(true)
  }

  /** the arrow under a ray (cast with the gizmo layer enabled), or null */
  hit(cast: { camera?: Camera | null; intersectObject: (o: Group, recursive: boolean) => { object: { userData: { axis?: Axis } } }[] }): Axis | null {
    if (!this.group.visible) return null
    if (cast.camera) this.fit(cast.camera) // the arrows as the pane the press came from draws them
    return cast.intersectObject(this.group, true).find((h) => h.object.userData.axis)?.object.userData.axis ?? null
  }

  dispose() {
    this.group.traverse((o) => { if (o instanceof Mesh) { o.geometry.dispose(); (o.material as MeshBasicMaterial).dispose() } })
    this.group.removeFromParent()
  }
}

/** how far along the axis line (through `origin`, along `dir`) the point nearest the ray lies; null when the ray runs along it */
export function alongAxis(ray: Ray, origin: Vector3, dir: Vector3): number | null {
  const w0 = origin.clone().sub(ray.origin), b = dir.dot(ray.direction)
  const d = dir.dot(w0), e = ray.direction.dot(w0), den = 1 - b * b
  if (den < 1e-6) return null
  return (b * e - d) / den
}
