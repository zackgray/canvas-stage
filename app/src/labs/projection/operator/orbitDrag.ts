// The standard 3D-app gesture on the stage in Operator mode with the Orbit rig: mouse down on a surface puts the pivot
// there (the camera does not move), drag orbits around it (horizontal = around, vertical = up / down), the wheel dollies
// toward / away from it. Only while the mouse is not locked; Alt+click locks it (mouse aim / framing offset), as a plain
// click does on the other rigs. Mid-take the pivot holds (mouse down does not move it) but drag and wheel still orbit.
// Keys and the pad drive the same rig, so they keep orbiting whatever pivot the mouse set.
import { Vector2 } from 'three'
import type { OrbitRig } from '../../controller/rigs/orbitRig'
import type { Stage } from '../engine/Stage'
import type { StageOperatorEngine } from './stageEngine'

/** radians per pixel of drag */
export const DRAG_RATE = 0.006
/** wheel: dolly factor per wheel unit (deltaY 100 ≈ 10 % nearer / further) */
export const WHEEL_RATE = 0.001

/** What a drag / wheel does to the rig (pure; the DOM wiring is attachOrbitDrag). */
export function dragOrbit(rig: OrbitRig, dx: number, dy: number) {
  rig.drag(-dx * DRAG_RATE, dy * DRAG_RATE)
}
export function wheelDolly(rig: OrbitRig, deltaY: number) {
  rig.dolly(Math.exp(deltaY * WHEEL_RATE))
}

/** Wire the gesture to the stage canvas; returns the detach. `dragging()` tells rest detection the camera is moving. */
export function attachOrbitDrag(stage: Stage, engine: StageOperatorEngine) {
  const canvas = stage.renderer.domElement
  let drag: { id: number; x: number; y: number; moved: boolean } | null = null
  let eatClick = false
  const rig = () => engine.rigs.orbit as OrbitRig
  const live = () => engine.rigId === 'orbit' && document.pointerLockElement !== canvas && !engine.deck.playback
    && !engine.pivot.picking
  // the Camera pane's own frame; null in another pane (the Free and Top panes keep their presses, wheel and clicks)
  const ndc = (e: MouseEvent): Vector2 | null => {
    if (stage.panes) return stage.panes.cameraNdc(e.clientX, e.clientY)
    const r = canvas.getBoundingClientRect()
    return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }

  const down = (e: PointerEvent) => {
    if (e.button !== 0 || e.altKey || !live()) return
    const at = ndc(e)
    if (!at) return
    const p = engine.deck.recording ? null : stage.pivot.hit(at)
    if (p) engine.pivot.place(p)
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    canvas.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    drag.x = e.clientX
    drag.y = e.clientY
    if (!dx && !dy) return
    drag.moved = true
    if (engine.rigId === 'orbit') dragOrbit(rig(), dx, dy)
  }
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    drag = null
    eatClick = true // the click that ends a press is the gesture's, not a pointer-lock request
    canvas.releasePointerCapture?.(e.pointerId)
  }
  // capture on the window: before the operator's own click (pointer lock) and wheel (zoom) on the canvas
  const click = (e: MouseEvent) => {
    if (e.target !== canvas) return
    const eat = eatClick || (live() && !e.altKey && ndc(e) !== null)
    eatClick = false
    if (eat) e.stopImmediatePropagation()
  }
  const wheel = (e: WheelEvent) => {
    if (e.target !== canvas || !live() || !ndc(e)) return
    e.stopImmediatePropagation()
    e.preventDefault()
    wheelDolly(rig(), e.deltaY)
  }

  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  window.addEventListener('click', click, true)
  window.addEventListener('wheel', wheel, { capture: true, passive: false })
  return {
    dragging: () => !!drag?.moved,
    detach: () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      window.removeEventListener('click', click, true)
      window.removeEventListener('wheel', wheel, true)
      drag = null
    },
  }
}
