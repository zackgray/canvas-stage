import { Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { isFormControl } from '../../controller/input/formControl'

/** WASD fly on top of OrbitControls: moves camera and orbit target together. Q/E down/up, Shift = fast. */
export class FlyKeys {
  private held = new Set<string>()
  private enabled = true
  speed = 2

  private camera: PerspectiveCamera
  private controls: OrbitControls

  constructor(camera: PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera
    this.controls = controls
    window.addEventListener('keydown', this.down)
    window.addEventListener('keyup', this.up)
    window.addEventListener('blur', this.clear)
  }

  private down = (e: KeyboardEvent) => {
    if (!this.enabled || isFormControl(e.target)) return
    this.held.add(e.code)
  }
  private up = (e: KeyboardEvent) => this.held.delete(e.code)
  /** Forget held keys (blur, or when another driver hands the camera back). */
  clear = () => this.held.clear()

  /** Off: every key is ignored and held ones are forgotten (the set is not on this page). */
  setEnabled(on: boolean) {
    this.enabled = on
    if (!on) this.clear()
  }

  update(dt: number) {
    if (this.held.size === 0) return
    const forward = new Vector3()
    this.camera.getWorldDirection(forward)
    const right = new Vector3().crossVectors(forward, this.camera.up).normalize()
    const move = new Vector3()
    if (this.held.has('KeyW')) move.add(forward)
    if (this.held.has('KeyS')) move.sub(forward)
    if (this.held.has('KeyD')) move.add(right)
    if (this.held.has('KeyA')) move.sub(right)
    if (this.held.has('KeyE')) move.y += 1
    if (this.held.has('KeyQ')) move.y -= 1
    if (move.lengthSq() === 0) return
    const fast = this.held.has('ShiftLeft') || this.held.has('ShiftRight') ? 4 : 1
    move.normalize().multiplyScalar(this.speed * fast * dt)
    this.camera.position.add(move)
    this.controls.target.add(move)
  }

  dispose() {
    window.removeEventListener('keydown', this.down)
    window.removeEventListener('keyup', this.up)
    window.removeEventListener('blur', this.clear)
  }
}
