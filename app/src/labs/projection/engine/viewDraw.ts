import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'

/**
 * Draws one live frame straight to the canvas. Offscreen renders (captures) never come here; they render the scene
 * themselves inside `Viewport.offscreen`.
 */
export class ViewDraw {
  private readonly renderer: WebGLRenderer

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
  }

  /** Size the canvas to its host and give the view camera the host's aspect. */
  fit(host: HTMLElement, view: PerspectiveCamera) {
    const w = Math.max(1, host.clientWidth)
    const h = Math.max(1, host.clientHeight)
    this.renderer.setSize(w, h)
    view.aspect = w / h
    view.updateProjectionMatrix()
  }

  /** `scene` is the stage's scene (the set on it, or the empty-stage backdrop); the stage's loop draws the surround layer around this call. */
  draw(scene: Scene, view: PerspectiveCamera) {
    this.renderer.render(scene, view)
  }
}
