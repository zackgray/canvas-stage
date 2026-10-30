import type { Object3D } from 'three'

/** A display-only layer drawn instead of, or next to, the projection meshes (splats). Never part of a capture. */
export interface Overlay {
  readonly object: Object3D
  readonly visible: boolean
  setVisible(on: boolean): void
}

/**
 * What the view shows: the projection meshes, overlays, or both. Every offscreen render (exports, stills, the hole
 * probe, the round trip) sees the meshes alone: `around` swaps that in and puts the user's choice back after.
 */
export class Display {
  meshVisible = true
  /** set by the Blocking look: meshes shown and overlays hidden whatever the view choice, until released */
  private meshOnly = false
  private readonly overlays = new Set<Overlay>()
  private readonly meshes: () => (Object3D | null | undefined)[]

  constructor(meshes: () => (Object3D | null | undefined)[]) {
    this.meshes = meshes
  }

  get overlayCount() { return this.overlays.size }

  setMeshVisible(on: boolean) {
    this.meshVisible = on
    this.applyMeshes(on)
  }

  /** Make every current mesh follow the choice (call after a mesh is created). */
  applyMeshes(on = this.meshVisible) {
    for (const m of this.meshes()) if (m) m.visible = on || this.meshOnly
  }

  /** Meshes alone in the live view (Blocking), or (false) back to the view choice. */
  setMeshOnly(on: boolean) {
    if (on === this.meshOnly) return
    this.meshOnly = on
    this.applyMeshes()
    for (const o of this.overlays) o.setVisible(!on)
  }

  add(o: Overlay) {
    this.overlays.add(o)
    if (this.meshOnly) o.setVisible(false)
  }

  remove(o: Overlay) { this.overlays.delete(o) }

  /** Run `fn` with the meshes shown and every overlay hidden, then restore. */
  around<T>(fn: () => T): T {
    const shown = [...this.overlays].filter((o) => o.visible)
    for (const o of shown) o.setVisible(false)
    this.applyMeshes(true)
    try {
      return fn()
    } finally {
      this.applyMeshes()
      for (const o of shown) o.setVisible(true)
    }
  }
}
