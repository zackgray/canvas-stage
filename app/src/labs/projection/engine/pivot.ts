import { Mesh, MeshBasicMaterial, Quaternion, Raycaster, SphereGeometry, Vector2, Vector3, type Object3D, type PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * Orbit pivot on the set's surface. Double-click a surface to orbit around that point (the door, a column);
 * a small marker shows where the pivot is. Without a hit (sky, holes) the pivot stays where it was.
 * A pivot the user placed (double-click, or a click while a pick is armed) is kept as `manual` until the set changes:
 * the operator's Orbit rig circles it (frame-centre surface is only the fallback). While another driver owns the camera
 * (the operator) the view has no context menu, and a right-click hands the surface under the cursor to `contextPick`.
 * The marker shows only while the user is orbiting or a pivot is placed: on bare ground it read as a stray dot.
 */
export class Pivot {
  readonly marker = new Mesh(
    new SphereGeometry(1, 16, 12),
    new MeshBasicMaterial({ color: 0xf2b84b, depthTest: false, transparent: true, opacity: 0.85 }),
  )
  /** false while another driver owns the camera: double-click does nothing */
  enabled = true
  /** the pivot the user placed, or null (the frame-centre surface stands in) */
  manual: Vector3 | null = null
  /** an armed one-shot pick: the next click on the view places the manual pivot */
  private picking: ((p: Vector3 | null) => void) | null = null
  /** a right-click on the view while another driver owns the camera (the operator's Orbit pivot re-places itself) */
  contextPick: ((p: Vector3) => void) | null = null
  /** the user is dragging an orbit right now (the controls' start/end) */
  private orbiting = false
  private ray = new Raycaster()
  private camera: PerspectiveCamera
  private controls: OrbitControls
  private dom: HTMLElement
  private targets: () => Object3D[]

  constructor(camera: PerspectiveCamera, controls: OrbitControls, dom: HTMLElement, targets: () => Object3D[]) {
    this.camera = camera
    this.controls = controls
    this.dom = dom
    this.targets = targets
    this.marker.renderOrder = 999
    this.marker.visible = false
    dom.addEventListener('dblclick', this.onDoubleClick)
    dom.addEventListener('contextmenu', this.onContextMenu)
    controls.addEventListener('start', this.onOrbitStart)
    controls.addEventListener('end', this.onOrbitEnd)
    // capture on the window: runs before the canvas's own click listeners (the operator's pointer lock)
    window.addEventListener('click', this.onPickClick, true)
  }

  /** Surface point under normalised device coords (-1..1), or null. */
  hit(ndc: Vector2) {
    this.camera.updateMatrixWorld(true)
    this.ray.setFromCamera(ndc, this.camera)
    const targets = this.targets()
    for (const t of targets) t.updateWorldMatrix(true, false)
    return this.ray.intersectObjects(targets, false)[0]?.point ?? null
  }

  /** Put the pivot on whatever surface is at the centre of the frame; false if nothing is there. */
  centre(sync = true): boolean {
    const p = this.hit(new Vector2(0, 0))
    if (!p) return false
    this.set(p, sync)
    return true
  }

  /** Move the pivot; `sync` = false leaves the camera alone (another driver owns it). Visibility is update's job. */
  set(point: { x: number; y: number; z: number }, sync = true) {
    this.controls.target.set(point.x, point.y, point.z)
    this.marker.position.copy(this.controls.target)
    if (sync) this.controls.update()
  }

  /** Keep the marker a constant size on screen and on the current target; shown only while orbiting or placed. */
  update() {
    this.marker.position.copy(this.controls.target)
    const d = this.camera.position.distanceTo(this.controls.target)
    this.marker.scale.setScalar(Math.max(0.01, d * 0.006))
    this.marker.visible = this.orbiting || this.manual !== null
  }

  /** Place the manual pivot (null clears it); the marker moves there, the camera does not (`sync` = false). */
  setManual(point: Vector3 | null) {
    this.manual = point ? point.clone() : null
    if (point) this.set(point, false)
  }

  /**
   * Arm a one-shot pick: the next click on the view places the manual pivot (and does nothing else: no pointer lock,
   * no focus). `done` gets the point, or null when the click hit nothing or the pick was cancelled. Returns the cancel.
   */
  pick(done: (p: Vector3 | null) => void): () => void {
    this.picking?.(null)
    this.picking = done
    this.dom.style.cursor = 'crosshair'
    return () => { if (this.picking === done) this.endPick(null) }
  }

  get pickArmed() { return !!this.picking }

  private endPick(p: Vector3 | null) {
    const done = this.picking
    this.picking = null
    this.dom.style.cursor = ''
    done?.(p)
  }

  private ndcOf(e: MouseEvent) {
    const r = this.dom.getBoundingClientRect()
    return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }

  private onPickClick = (e: MouseEvent) => {
    if (!this.picking || e.target !== this.dom) return
    e.stopImmediatePropagation()
    e.preventDefault()
    const p = this.hit(this.ndcOf(e))
    if (p) this.setManual(p)
    this.endPick(p ? p.clone() : null)
  }

  // Orbit camera mode leaves the right button to OrbitControls (pan); under the operator it re-places the pivot
  // (not while the mouse is locked: there is no cursor to aim with)
  private onContextMenu = (e: MouseEvent) => {
    if (this.enabled) return
    e.preventDefault()
    if (!this.contextPick || document.pointerLockElement === this.dom) return
    const p = this.hit(this.ndcOf(e))
    if (p) this.contextPick(p.clone())
  }

  private onDoubleClick = (e: MouseEvent) => {
    if (!this.enabled) return
    const p = this.hit(this.ndcOf(e))
    if (p) {
      this.manual = p.clone()
      this.set(p)
    }
  }

  dispose() {
    this.endPick(null)
    window.removeEventListener('click', this.onPickClick, true)
    this.dom.removeEventListener('dblclick', this.onDoubleClick)
    this.dom.removeEventListener('contextmenu', this.onContextMenu)
    this.controls.removeEventListener('start', this.onOrbitStart)
    this.controls.removeEventListener('end', this.onOrbitEnd)
    this.marker.geometry.dispose()
    ;(this.marker.material as MeshBasicMaterial).dispose()
  }

  private onOrbitStart = () => { this.orbiting = true }
  private onOrbitEnd = () => { this.orbiting = false }
}

/**
 * Make OrbitControls turn about `up` (the mouse orbit's vertical axis) instead of +Y. OrbitControls reads the camera's
 * up once, at construction, into a private rotation; this sets both. `null` restores +Y.
 */
export function setControlsUp(controls: OrbitControls, camera: PerspectiveCamera, up: Vector3 | null) {
  camera.up.copy(up ?? new Vector3(0, 1, 0))
  const c = controls as unknown as { _quat?: Quaternion; _quatInverse?: Quaternion }
  if (!c._quat || !c._quatInverse) return
  c._quat.setFromUnitVectors(camera.up, new Vector3(0, 1, 0))
  c._quatInverse.copy(c._quat).invert()
}
