// What the Stage holds and shows: renderer, scene, view + projector cameras, the projected set, the surround far layer,
// the world clock's objects, the pivot, the empty-stage backdrop and the viewport dressing. The camera loop, drivers and
// camera moves are Stage's (Stage.ts); this half is the scene's contents and the captures of it. The world root scale
// (worldScale.ts) is applied here, to the set, the surround and the performance alike.
import { BackSide, CircleGeometry, Color, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, SphereGeometry, Vector3, WebGLRenderer, type Light, type Object3D, type Texture } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { toDeg, vfovFromFocal } from '../math/camera'
import type { GridMesh, GridOptions } from '../math/grid'
import type { CarPose } from '../world/path'
import { World } from '../world/World'
import type { Overlay } from './display'
import type { LookMode } from './look'
import { Pivot } from './pivot'
import type { ProjectionSource } from './projectionSource'
import type { ProjectorLayer } from './settled'
import { SetMeshes, type StageChange } from './setMeshes'
import { SurroundLayer } from './surround'
import type { FloorPlane } from './groundMatch'
import { EXPORT_ASPECT, Panes } from './panes'
import { drawLive } from './surround'
import { ViewDraw } from './viewDraw'
import { Viewport } from './viewport'
import { WorldRoot } from './worldRoot'
import type { KitLayer } from '../stage3d/KitLayer'

/** The renderer as the surround's hi-res colour sees it: its texture size limit and an upload that reports a refusal. */
function gpuOf(renderer: WebGLRenderer) {
  return {
    maxTextureSize: renderer.capabilities.maxTextureSize,
    upload(t: Texture): boolean {
      const gl = renderer.getContext()
      while (gl.getError() !== gl.NO_ERROR) { /* drop older errors: only this upload's count */ }
      renderer.initTexture(t)
      return gl.getError() !== gl.OUT_OF_MEMORY
    },
  }
}

export const PROJECTOR_POSITION = new Vector3(0, 1.6, 0)
export const PROJECTOR_TARGET = new Vector3(0, 1.0, -8)
const SKY = new Color(0x9fb8d6)
const EMPTY_GROUND = new Color(0x6f7277)

/** The empty stage's backdrop: a plain ground disc under a plain sky dome, nothing else (never a test set). */
function emptyBackdrop(): Group {
  const sky = new Mesh(new SphereGeometry(900, 32, 16), new MeshBasicMaterial({ color: SKY, side: BackSide, depthWrite: false, fog: false }))
  sky.frustumCulled = false
  const ground = new Mesh(new CircleGeometry(600, 48).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: EMPTY_GROUND, fog: false }))
  const g = new Group()
  g.name = 'empty-stage'
  g.add(sky, ground)
  g.visible = false
  return g
}

export abstract class StageScene {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly view = new PerspectiveCamera(40, 1, 0.02, 2000)
  readonly projector = new PerspectiveCamera(40, 16 / 9, 0.02, 2000)
  readonly controls: OrbitControls
  /** what moves in the set (the car) and the world clock; a scene object in the view and in every capture */
  readonly world = new World()
  /** the location's 360 surround (far mesh + sky dome) behind the set; offscreen renders include it only inside `surround.captureOn` */
  readonly surround: SurroundLayer
  protected set: SetMeshes
  protected meshes = () => this.set.meshes()
  /** the orbit pivot and its marker; the user's placed pivot (`pivot.manual`) is what the operator's Orbit rig circles */
  readonly pivot: Pivot
  /** gizmo, hole background, mesh/splats display and look; strips them for captures */
  protected viewport: Viewport
  protected drawer: ViewDraw
  /** the split panes (step 5): Free/Top cameras over the same scene; they put nothing into it, so captures never see them */
  readonly panes: Panes
  /** the world root scale: set, surround and performance scaled together about the projector */
  readonly root: WorldRoot
  /** the empty stage's plain ground and sky dome, shown only while the stage has no set (a scene with no world yet) */
  private readonly empty: Group

  constructor(host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.appendChild(this.renderer.domElement)
    this.projector.position.copy(PROJECTOR_POSITION)
    this.projector.lookAt(PROJECTOR_TARGET)
    this.scene.add(this.projector, this.world.group)
    this.root = new WorldRoot(this.projector)
    this.set = new SetMeshes(this.scene, this.projector, () => this.viewport, this.root.set)
    this.scene.userData.surround = this.surround = new SurroundLayer(this.projector)
    this.surround.gpu = gpuOf(this.renderer)
    this.controls = new OrbitControls(this.view, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.rotateSpeed = 0.6
    this.pivot = new Pivot(this.view, this.controls, this.renderer.domElement, () => this.pickable())
    this.scene.add(this.pivot.marker)
    this.viewport = new Viewport(this.scene, this.meshes, this.pivot.marker)
    this.drawer = new ViewDraw(this.renderer)
    this.panes = new Panes(this.renderer, this.view, this.controls, PROJECTOR_TARGET, this.drawer)
    this.panes.frameAspect = EXPORT_ASPECT
    this.empty = emptyBackdrop()
    this.scene.add(this.empty)
  }

  /** Projector focal length (36 mm-wide sensor) for a still of the given aspect. */
  setProjectorLens(focalMm: number, aspect: number) {
    this.projector.fov = toDeg(vfovFromFocal(focalMm, aspect))
    this.projector.aspect = aspect
    this.projector.updateProjectionMatrix()
  }

  /** the source still + depth, its grid and the settled projectors stacked on it (the original wins where both have geometry) */
  get source(): ProjectionSource | null { return this.set.source }
  get grid(): GridMesh | null { return this.set.grid }
  get layers(): readonly ProjectorLayer[] { return this.set.layers }
  setSource(source: ProjectionSource | null) { this.set.setSource(source); this.surround.follow(source) }

  /** a kit world (Stage3D) on the stage: real geometry as the set, with its own lights, sky dome and fog; null = none */
  get kit(): KitLayer | null { return this.kitLayer }
  private kitLayer: KitLayer | null = null
  /** Put a kit world on the stage (null takes it off): its group in the scene, its fog on the scene, shadows on while it is. */
  setKit(k: KitLayer | null) {
    if (this.kitLayer === k) return
    this.kitLayer?.group.removeFromParent()
    this.kitLayer = k
    if (k) this.scene.add(k.group)
    this.scene.fog = k?.fog ?? null
    this.renderer.shadowMap.enabled = !!k
    // the kit brings its own key and fill; the world clock's car lights would double them on the kit and the performer
    for (const c of this.world.group.children) if ((c as Light).isLight) c.visible = !k
  }

  /** What a click or the frame centre can land on: the set's meshes, a kit world's meshes, the car and the performance's actors. */
  protected pickable(): Object3D[] {
    const out: Object3D[] = this.meshes().filter((m): m is Mesh => !!m)
    if (this.kitLayer) out.push(...this.kitLayer.meshes())
    for (const o of [this.world.car?.root, this.world.performance?.object]) {
      o?.traverse((c) => { if ((c as Mesh).isMesh && c.visible) out.push(c) })
    }
    return out
  }
  /** Rebuild the displaced grid for the current source and projector lens. */
  rebuild(options: GridOptions): GridMesh | null { return this.set.rebuild(options) }
  addLayer(layer: ProjectorLayer) { this.set.addLayer(layer) }
  clearLayers() { this.set.clearLayers() }
  /** Listen for mesh rebuilds and settled-layer changes; returns the unsubscribe. */
  onChange(fn: (what: StageChange) => void): () => void { return this.set.onChange(fn) }

  /** true metres per app unit of the set as loaded (1 unless the world says otherwise) */
  get worldScale(): number { return this.root.s }

  /**
   * Scale the world (set, surround, performance) about the projector by s, and match the surround's ground to the set's
   * `floor` (projector camera space, app units before the scale; null = no ground match). The master view does not move.
   */
  setWorldScale(s: number, floor: FloorPlane | null = null) {
    this.root.s = s
    this.surround.rootScale = this.root.s
    const ty = Math.tan((this.projector.fov * Math.PI) / 360)
    this.surround.setSetFloor(floor, { tx: ty * this.projector.aspect, ty })
    this.viewport.updateGizmo(this.projector, this.source?.depth ?? null, this.root.s)
    this.syncRoot()
  }

  /** Keep the performance on the root (it can arrive or change after the scale was set). */
  protected syncRoot() {
    const o = this.world.performance?.object
    if (o && this.root) this.root.place(o) // test fakes built from the prototype have no root
  }

  /** Show or hide the projection meshes (original and settled) in the live view; captures always show them. */
  setMeshVisible(on: boolean) { this.viewport.display.setMeshVisible(on) }

  /** Textured (the still) or Blocking (grey form, meshes only) in the live view; captures always render Textured. */
  setLook(mode: LookMode) { this.viewport.look.set(mode) }

  /** Display-only layers (splats): added to the scene, hidden around every offscreen render. */
  addOverlay(o: Overlay) {
    this.scene.add(o.object)
    this.viewport.display.add(o)
  }

  removeOverlay(o: Overlay) {
    this.viewport.display.remove(o)
    o.object.removeFromParent()
  }

  setHoleMask(on: boolean) { this.viewport.setHoleMask(on) }

  /** Show the plain ground-and-sky backdrop (a scene with no world yet) or hide it (a set is on the stage). */
  setEmpty(on: boolean) { this.empty.visible = on }

  /**
   * The live frame (the loop's one draw, step 5): split across the enabled panes when several are on; otherwise the
   * camera's full frame exactly as before — same scene, same surround rule. The view's aspect is kept at the
   * canvas' even across a pane-set change (a split leaves a half-frame aspect behind that no resize corrects).
   */
  protected drawFrame(scene: Scene) {
    if (this.panes.draw(scene)) return
    const c = this.renderer.domElement
    const aspect = Math.max(1, c.clientWidth) / Math.max(1, c.clientHeight)
    if (this.view.aspect !== aspect) { this.view.aspect = aspect; this.view.updateProjectionMatrix() }
    drawLive(this.surround, this.renderer, this.scene, this.view, false, () => this.drawer.draw(scene, this.view))
  }

  /**
   * Run an offscreen render with gizmos, path handles, the hole-mask background and overlays out of the way (meshes
   * shown, textured). The world's objects stay in, posed at the clock's current time.
   */
  offscreen<T>(fn: () => T): T {
    this.syncRoot()
    return this.viewport.offscreen(() => this.world.capture(fn))
  }

  /** `offscreen` with the world clock at time t (objects posed there, from `poses` when given), restored after. */
  offscreenAt<T>(t: number, fn: () => T, poses?: Map<string, CarPose>): T {
    return this.world.at(t, () => this.offscreen(fn), poses)
  }

  /** A copy of the view camera with the still's aspect, for exports at source resolution. */
  exportCamera(): PerspectiveCamera {
    const cam = this.view.clone()
    if (this.source) cam.aspect = this.source.width / this.source.height
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld(true)
    return cam
  }

  /** Free the scene's parts (the set, surround, world, renderer); Stage frees its own first. */
  protected disposeScene() {
    this.pivot.dispose()
    this.panes.dispose()
    this.controls.dispose()
    this.set.dispose()
    this.surround.dispose()
    this.world.dispose()
    this.empty.traverse((o) => { const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } }; m.geometry?.dispose(); m.material?.dispose() })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
