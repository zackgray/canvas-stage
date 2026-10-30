import { CameraHelper, Color, PerspectiveCamera, type Mesh, type Scene } from 'three'
import { depthRange } from '../math/depth'
import { Display } from './display'
import { Look } from './look'

const BACKGROUND = new Color(0x1c1d21)
const HOLE = new Color(1, 0, 1)

/**
 * What the live view draws over and around the set: the projector gizmo, the hole-mask background, the display
 * choice (mesh / splats) and the look (textured / blocking). `offscreen` strips all of it for
 * captures: the meshes alone, textured, with no gizmo or pivot marker.
 */
export class Viewport {
  readonly display: Display
  readonly look: Look
  private gizmoCam = new PerspectiveCamera()
  readonly gizmo = new CameraHelper(this.gizmoCam)
  private holeMask = false
  private readonly scene: Scene
  private readonly marker: Mesh

  constructor(scene: Scene, meshes: () => (Mesh | null | undefined)[], marker: Mesh) {
    this.scene = scene
    this.marker = marker
    this.display = new Display(meshes)
    this.look = new Look(meshes, this.display, scene)
    scene.background = BACKGROUND
    scene.add(this.gizmo)
  }

  /** Make every current mesh follow the display and look choices (call after a mesh is created). */
  applyMeshes() {
    this.display.applyMeshes()
    this.look.apply()
  }

  setHoleMask(on: boolean) {
    this.holeMask = on
    this.scene.background = on ? HOLE : BACKGROUND
    this.gizmo.visible = !on
  }

  /** Fit the projector gizmo to the projector, reaching to the set's far depth. */
  updateGizmo(projector: PerspectiveCamera, depth: Float32Array | null, scale = 1) {
    const range = depth ? depthRange(depth) : { min: 1, max: 10 }
    this.gizmoCam.copy(projector, false)
    this.gizmoCam.near = 0.05
    this.gizmoCam.far = Number.isFinite(range.max) ? Math.min(range.max * scale, 40) : 10
    this.gizmoCam.updateProjectionMatrix()
    this.gizmoCam.updateMatrixWorld(true)
    this.gizmo.update()
  }

  /** Run an offscreen render with gizmos, the hole-mask background and overlays out of the way (meshes shown, textured). */
  offscreen<T>(fn: () => T): T {
    const gizmo = this.gizmo.visible
    const marker = this.marker.visible
    this.gizmo.visible = false
    this.marker.visible = false
    try {
      return this.display.around(() => this.look.around(fn))
    } finally {
      this.gizmo.visible = gizmo && !this.holeMask
      this.marker.visible = marker
    }
  }
}
