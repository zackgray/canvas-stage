// The lab's one Stage: the scene (stageScene.ts) plus the camera loop, the per-frame driver (the operator engine) and the
// view camera's moves (snap, orbit, pivot).
import { Vector3 } from 'three'
import { FlyKeys } from './flyKeys'
import type { ProjectionSource } from './projectionSource'
import type { StageChange } from './setMeshes'
import { StageScene } from './stageScene'
import { aimAhead, orbitAround, resumeOrbit, snapView } from './viewMoves'
export type { ProjectionSource, StageChange }
export { PROJECTOR_POSITION, PROJECTOR_TARGET } from './stageScene'

export class Stage extends StageScene {
  private fly: FlyKeys
  /** per-frame camera driver (the operator engine); while set, orbit, fly keys and pivot clicks are inert */
  private driver: ((dt: number) => void) | null = null
  private frame = 0
  private last = performance.now()
  private resizer: ResizeObserver

  constructor(host: HTMLElement) {
    super(host)
    this.fly = new FlyKeys(this.view, this.controls)
    this.resizer = new ResizeObserver(() => this.drawer.fit(host, this.view))
    this.resizer.observe(host)
    this.drawer.fit(host, this.view)
    this.snapToProjector()
    this.loop()
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    if (this.driver) this.driver(dt)
    else {
      this.fly.update(dt)
      this.controls.update()
    }
    // the operator engine advances the world clock while it drives (its timeline is the clock)
    this.world.frame(this.driver ? 0 : dt)
    this.syncRoot()
    this.pivot.update()
    this.drawFrame(this.scene)
  }

  /** Put the view camera exactly where the projector is, with its lens. */
  snapToProjector() {
    snapView(this.view, this.projector, this.controls, this.source?.depth ?? null, this.worldScale)
    // Prefer a pivot on the surface at the centre of the frame over a point floating behind the facade.
    this.pivot.centre()
  }

  /**
   * The set changed scale under the camera (depth model, depth values, lens) without a source switch: put the pivot
   * back on the surface ahead, else at the set's typical depth. The camera stays put; the operator aims on its own.
   * A placed pivot no longer sits on a surface, so it is dropped.
   */
  repivot() {
    this.pivot.manual = null
    if (this.driver || this.pivot.centre()) return
    aimAhead(this.view, this.controls, this.source?.depth ?? null, this.worldScale)
  }

  /** Swing the view around the orbit target by yaw/pitch degrees (for repeatable off-angle checks). */
  orbitBy(yawDeg: number, pitchDeg = 0) {
    orbitAround(this.view, this.controls, yawDeg, pitchDeg)
  }

  /** Hand the view to a per-frame driver, or (null) back to orbit + fly keys from wherever the driver left it. */
  setDriver(driver: ((dt: number) => void) | null) {
    const handBack = !!this.driver && !driver
    this.driver = driver
    this.controls.enabled = this.pivot.enabled = !driver
    this.panes.setDriver(!!driver) // the panes' steering stands down too; it re-arms on the next press
    this.fly.clear()
    if (handBack) resumeOrbit(this.view, this.controls, () => this.pivot.centre())
  }

  /**
   * Keyboard input on or off: off while the set is not on the page (Develop, Render), so no key moves a hidden camera.
   * Orbit and pivot need the canvas, which is hidden there, so only the fly keys need switching.
   */
  setInputEnabled(on: boolean) {
    this.fly.setEnabled(on)
  }

  /** Pivot onto the surface at the centre of the frame, without moving the camera; returns the orbit target. */
  aimPivot(): Vector3 {
    this.pivot.centre(false)
    return this.controls.target
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.resizer.disconnect()
    this.fly.dispose()
    this.disposeScene()
  }
}
