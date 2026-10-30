import type { Mesh, Object3D } from 'three'
import { isClayTarget, type ClayTarget } from './clay'
import type { Display } from './display'
import { setBlocking, setClayWorld } from './materials'

/**
 * Textured: the still projected on the set. Blocking: plain grey form, for lining up a shot. Clay: what the Layout-To-Render
 * pass will follow (a grey clay performer, the world as smoothed luma, one key light); a preview, never exported.
 */
export type LookMode = 'textured' | 'blocking' | 'clay'
export const LOOKS: readonly LookMode[] = ['textured', 'blocking', 'clay']

/**
 * The live view's look over every projection mesh (the original and each settled projector). Blocking flips a
 * uniform on the meshes' own materials (nothing is allocated or swapped) and shows the meshes alone: splats carry
 * colour, not form, so they are hidden until Textured comes back. Clay also reaches the performer and the surround
 * (their `ClayTarget`s, found from the scene). Captures always see Textured (`around`).
 */
export class Look {
  mode: LookMode = 'textured'
  private readonly meshes: () => (Mesh | null | undefined)[]
  private readonly display: Display
  private readonly scene: Object3D | null

  constructor(meshes: () => (Mesh | null | undefined)[], display: Display, scene: Object3D | null = null) {
    this.meshes = meshes
    this.display = display
    this.scene = scene
  }

  set(mode: LookMode) {
    this.mode = mode
    this.apply()
  }

  /** Make every current mesh follow the look (call after a mesh is created). */
  apply() {
    this.paint(this.mode)
    this.display.setMeshOnly(this.mode !== 'textured')
  }

  /** Run `fn` with every mesh textured, then put the look back. Overlays are the Display's business. */
  around<T>(fn: () => T): T {
    if (this.mode === 'textured') return fn()
    this.paint('textured')
    try {
      return fn()
    } finally {
      this.paint(this.mode)
    }
  }

  private paint(mode: LookMode) {
    for (const m of this.meshes()) {
      if (!m) continue
      if (mode === 'clay') setClayWorld(m.material, true)
      else setBlocking(m.material, mode === 'blocking')
    }
    for (const t of this.clayTargets()) t.setClay(mode === 'clay')
  }

  /** The layers that follow Clay: the surround and the performance (it registers itself on its group). */
  private clayTargets(): ClayTarget[] {
    const out: ClayTarget[] = []
    if (!this.scene) return out
    const surround = this.scene.userData.surround
    if (isClayTarget(surround)) out.push(surround)
    this.scene.traverse((o) => { if (isClayTarget(o.userData.clayTarget)) out.push(o.userData.clayTarget) })
    return out
  }
}
