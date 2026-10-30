// The Stage's panes (the merge, step 5): the lab viewport's first multi-camera support. The same scene draws through
// every enabled pane camera — the operator's Camera (the view camera itself), a Free perspective orbit and a Top
// orthographic plan — each into its own rectangle of the one canvas (setViewport/setScissor). The Free camera orbits
// with three's OrbitControls; the Top camera looks straight down and takes wheel zoom and drag pan. A press is steered
// to the pane under it: a gate on the canvas' parent (capture phase, so before the canvas' own listeners) arms that
// pane's controls and disarms the others. The operator driver owns the Camera pane's orbit only (setDriver): the Free
// and Top steering belongs to the arranging owner in every camera mode, so a driven camera never stands in its way.
// The panes put nothing into the scene — the Top View's labels and walking lane are DOM overlays projected per pane
// (useStagePick.ts) — so no capture ever sees them; withPickOverlaysHidden's gate stands as it was, and panes.draw only
// ever draws the same scene the single-camera path drew.
import { Color, FogExp2, PerspectiveCamera, Raycaster, Vector2, Vector3, type Camera, type OrthographicCamera, type Scene, type WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { fitAspect, ORDER, paneSlots, type PaneId, type PaneRect } from './paneLayout'
import { drawLive, layered, liveLayer, type SurroundLayer } from './surround'
import { TopPlan } from './topPlan'
import type { ViewDraw } from './viewDraw'
export { EXPORT_ASPECT, fitAspect, type PaneId, type PaneRect } from './paneLayout'

/** the free view starts above and behind its home, the whole set in view (the Set's free view) */
const FREE_OFFSET = new Vector3(8, 8, 11)
/** what the canvas shows outside every pane's picture: the bars around the fitted Camera frame */
const BARS = new Color(0x000000)
/** the Free view thins the planner's fog density by this much, or a set reads as wall-to-wall haze from outside */
export const FREE_FOG = 0.35

/**
 * Run the Free pane's draw with the scene's fog thinned for that draw only. The scene's fog object — what every
 * capture reads, the clay frames the draw and render are made from — keeps the plan's density throughout.
 */
export function withFreeFog(scene: Scene, draw: () => void): void {
  const fog = scene.fog
  if (!(fog instanceof FogExp2)) return draw()
  const density = fog.density
  fog.density = density * FREE_FOG
  try { draw() } finally { fog.density = density }
}

export class Panes {
  readonly free: PerspectiveCamera
  readonly top: OrthographicCamera
  /** the free pane's orbit; armed only while the pointer is over its rectangle (the gate, below) */
  readonly freeControls: OrbitControls
  private readonly r: WebGLRenderer
  private readonly view: PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly drawer: ViewDraw
  private on: readonly PaneId[] = ['camera']
  /** the operator driver owns the Camera pane's controls; the Free and Top steering is the arranging owner's, whatever the camera mode */
  private camArmed = true
  /** the export frame's w/h: when set, the Camera pane is letterboxed/pillarboxed to it inside its slot, so what is framed is what is drawn */
  frameAspect: number | null = null
  private readonly plan: TopPlan
  private readonly dom: HTMLCanvasElement
  private readonly host: HTMLElement

  constructor(r: WebGLRenderer, view: PerspectiveCamera, controls: OrbitControls, home: Vector3,
    drawer: ViewDraw) {
    this.r = r
    this.view = view
    this.controls = controls
    this.drawer = drawer
    this.dom = r.domElement
    this.host = this.dom.parentElement ?? this.dom
    this.free = new PerspectiveCamera(45, 1, view.near, view.far)
    this.free.position.copy(home).add(FREE_OFFSET)
    this.freeControls = new OrbitControls(this.free, this.dom)
    this.freeControls.enabled = false
    this.freeControls.screenSpacePanning = false
    this.freeControls.maxPolarAngle = Math.PI / 2 - 0.02 // never under the ground, as the Set's free view
    this.freeControls.target.copy(home)
    this.freeControls.update()
    this.plan = new TopPlan(home)
    this.top = this.plan.camera
    this.host.addEventListener('pointerdown', this.gate, true)
    this.host.addEventListener('pointermove', this.gate, true)
    this.dom.addEventListener('pointerdown', this.topDown)
    this.dom.addEventListener('pointermove', this.topMove)
    this.dom.addEventListener('pointerup', this.topUp)
    this.dom.addEventListener('wheel', this.topWheel, { passive: false })
  }

  /**
   * Open the Free view and the Top View on a whole set whose pieces lie farther out than their default framing (the planner stands a
   * prop on a stand-in 25-35 m away): the plan centred on the spread with `radius` metres in view, the Free orbit pulled back to match.
   * A set that fits the defaults is left alone (the caller does not call this for it).
   */
  frameSet(cx: number, cz: number, radius: number): void {
    this.plan.centre(cx, cz, radius, this.topAspect())
    const target = new Vector3(cx, 0, cz)
    this.free.position.copy(target).addScaledVector(FREE_OFFSET, Math.max(1, (radius * 1.6) / FREE_OFFSET.length()))
    this.freeControls.target.copy(target)
    this.freeControls.update()
  }

  /** which panes are on (ViewSwitch keeps at least one on; a bare Panes starts at the camera) */
  get active(): readonly PaneId[] { return this.on.length ? this.on : ['camera'] }
  set(on: readonly PaneId[]): void { this.on = ORDER.filter((p) => on.includes(p)) }
  /** more than one pane on: the canvas splits */
  split(): boolean { return this.active.length > 1 }

  /** the panes' rectangles over a canvas of w×h css px, in draw order */
  rects(w: number, h: number): { pane: PaneId; rect: PaneRect }[] {
    const slots = paneSlots(this.active, w, h)
    const a = this.frameAspect
    return a ? slots.map((s) => (s.pane === 'camera' ? { pane: s.pane, rect: fitAspect(s.rect, a) } : s)) : slots
  }

  /** one pane's rectangle over a w×h canvas, or null when that pane is off */
  rect(pane: PaneId, w: number, h: number): PaneRect | null {
    return this.rects(w, h).find((r) => r.pane === pane)?.rect ?? null
  }

  /** one pane's whole slot (the Camera's bars included), or null when that pane is off: its frame on the page */
  slot(pane: PaneId, w: number, h: number): PaneRect | null {
    return paneSlots(this.active, w, h).find((r) => r.pane === pane)?.rect ?? null
  }

  /** the pane the last press landed in (its controls answer the keys); the first pane on until a press says otherwise */
  get focused(): PaneId {
    const on = this.active
    return on.includes(this.pressed) ? this.pressed : on[0]
  }
  private pressed: PaneId = 'camera'

  /** the camera a pane draws through ('camera' is the view camera itself) */
  camera(pane: PaneId): Camera { return pane === 'camera' ? this.view : pane === 'free' ? this.free : this.top }

  /** the pane under a client point, or null outside the canvas */
  at(clientX: number, clientY: number): PaneId | null {
    const r = this.dom.getBoundingClientRect()
    const x = clientX - r.left, y = clientY - r.top
    if (x < 0 || y < 0 || x > r.width || y > r.height) return null
    const hit = this.rects(r.width || 1, r.height || 1)
      .find(({ rect }) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h)
    return hit?.pane ?? null
  }

  /** a ray through a client point, from the pane under it (none there: the camera's full frame, as before panes) */
  rayAt(clientX: number, clientY: number): Raycaster {
    const r = this.dom.getBoundingClientRect()
    const w = r.width || 1, h = r.height || 1
    const pane = this.at(clientX, clientY) ?? 'camera'
    const rect = this.rect(pane, w, h) ?? { x: 0, y: 0, w, h }
    const cam = this.camera(pane)
    cam.updateMatrixWorld()
    const ndc = new Vector2(((clientX - r.left - rect.x) / (rect.w || 1)) * 2 - 1, -((clientY - r.top - rect.y) / (rect.h || 1)) * 2 + 1)
    const ray = new Raycaster()
    ray.setFromCamera(ndc, cam)
    return ray
  }

  /** a client point as normalised device coords of the Camera pane, or null when the point is in another pane (or none) */
  cameraNdc(clientX: number, clientY: number): Vector2 | null {
    if (this.at(clientX, clientY) !== 'camera') return null
    const r = this.dom.getBoundingClientRect()
    const rect = this.rect('camera', r.width || 1, r.height || 1)
    if (!rect) return null
    return new Vector2(((clientX - r.left - rect.x) / (rect.w || 1)) * 2 - 1, -((clientY - r.top - rect.y) / (rect.h || 1)) * 2 + 1)
  }

  /** a world point projected into a pane: css px over the canvas + whether it shows there */
  project(pane: PaneId, p: Vector3): { x: number; y: number; inside: boolean } {
    const r = this.dom.getBoundingClientRect()
    const w = r.width || 1, h = r.height || 1
    const rect = this.rect(pane, w, h) ?? { x: 0, y: 0, w, h }
    const cam = this.camera(pane)
    cam.updateMatrixWorld()
    const v = p.clone().project(cam)
    return {
      x: rect.x + ((v.x + 1) / 2) * rect.w,
      y: rect.y + ((1 - v.y) / 2) * rect.h,
      inside: v.z < 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05,
    }
  }

  /** the operator driver owns the Camera pane's orbit; the Free and Top panes keep their steering in every camera mode */
  setDriver(on: boolean): void {
    this.camArmed = !on
    if (on) this.controls.enabled = false
  }

  /** arm the pane under the pointer before the canvas' own listeners (the orbits) see the press; the Camera pane's orbit stays
   *  disarmed while the operator driver owns it (camArmed), the Free pane's is armed only under its own rectangle */
  private gate = (e: PointerEvent) => {
    const pane = this.at(e.clientX, e.clientY)
    if (e.type === 'pointerdown' && pane) this.pressed = pane
    this.controls.enabled = this.camArmed && pane === 'camera'
    this.freeControls.enabled = pane === 'free'
  }

  private topDrag: { x: number; y: number } | null = null

  private topDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.at(e.clientX, e.clientY) !== 'top') return
    this.topDrag = { x: e.clientX, y: e.clientY }
    this.dom.setPointerCapture?.(e.pointerId)
  }

  private topMove = (e: PointerEvent) => {
    const d = this.topDrag
    if (!d) return
    const r = this.dom.getBoundingClientRect()
    const rect = this.rect('top', r.width || 1, r.height || 1)
    this.plan.pan(e.clientX - d.x, e.clientY - d.y, rect?.h ?? 280, this.topAspect())
    d.x = e.clientX; d.y = e.clientY
  }

  private topUp = (e: PointerEvent) => {
    this.topDrag = null
    this.dom.releasePointerCapture?.(e.pointerId)
  }

  private topWheel = (e: WheelEvent) => {
    if (this.at(e.clientX, e.clientY) !== 'top') return
    e.preventDefault()
    this.plan.zoom(e.deltaY, this.topAspect())
  }

  /** the Top pane's w/h on the canvas now (1 while it is off) */
  private topAspect(): number {
    const rect = this.rect('top', this.dom.clientWidth || 1, this.dom.clientHeight || 1)
    return rect ? rect.w / rect.h : 1
  }

  /**
   * Draw the live frame split across the enabled panes; false when one pane is on, where the caller's single full-frame
   * path stands untouched. The Camera pane keeps the draw it has always had (surround, then ViewDraw); the
   * Free and Top panes draw the same scene straight, the far layer behind it;
   * the Free view thins the fog for its draw only (withFreeFog).
   */
  draw(scene: Scene): boolean {
    // the Camera alone is the single full-frame path; Free or Top alone still draw through their own camera, or the
    // viewport would show the Camera while every press (rayAt) and orbit went to a camera nobody can see
    if (!this.split() && this.active[0] === 'camera' && !this.frameAspect) return false
    const c = this.dom
    const w = Math.max(1, c.clientWidth), h = Math.max(1, c.clientHeight)
    const surround = (scene.userData.surround as SurroundLayer | undefined) ?? null
    // the whole canvas to black first: the pane draws are scissored to their rectangles, and the canvas keeps its last frame
    // (preserveDrawingBuffer), so the bars around a fitted Camera pane would otherwise show whatever was drawn there before
    this.clearBlack(w, h)
    this.r.setScissorTest(true)
    try {
      for (const { pane, rect } of this.rects(w, h)) {
        const cam = this.camera(pane)
        if (cam instanceof PerspectiveCamera) { cam.aspect = rect.w / rect.h; cam.updateProjectionMatrix() }
        else this.plan.frame(rect.w / rect.h)
        this.r.setViewport(rect.x, h - rect.y - rect.h, rect.w, rect.h)
        this.r.setScissor(rect.x, h - rect.y - rect.h, rect.w, rect.h)
        if (pane === 'camera') {
          if (surround) drawLive(surround, this.r, scene, this.view, false, () => this.drawer.draw(scene, this.view))
          else this.drawer.draw(scene, this.view)
        } else {
          const far = surround ? liveLayer(surround, scene, false) : null
          const draw = () => this.r.render(scene, cam)
          // the Free view thins the planner's fog so layouts can be read through it; the Top View keeps the plan's
          layered(this.r, scene, cam, far, () => (pane === 'free' ? withFreeFog(scene, draw) : draw()), { clear: true })
        }
      }
    } finally {
      this.r.setScissorTest(false)
      this.r.setViewport(0, 0, w, h)
    }
    return true
  }

  /** the whole w×h canvas to opaque black (colour, depth, stencil), the renderer's own clear colour put back after */
  private clearBlack(w: number, h: number) {
    const colour = this.r.getClearColor(new Color()), alpha = this.r.getClearAlpha()
    this.r.setScissorTest(false)
    this.r.setViewport(0, 0, w, h)
    this.r.setClearColor(BARS, 1)
    this.r.clear(true, true, true)
    this.r.setClearColor(colour, alpha)
  }

  dispose(): void {
    this.host.removeEventListener('pointerdown', this.gate, true)
    this.host.removeEventListener('pointermove', this.gate, true)
    this.dom.removeEventListener('pointerdown', this.topDown)
    this.dom.removeEventListener('pointermove', this.topMove)
    this.dom.removeEventListener('pointerup', this.topUp)
    this.dom.removeEventListener('wheel', this.topWheel)
    this.freeControls.dispose()
  }
}
