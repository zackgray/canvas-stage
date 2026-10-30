// Operator mode: the controller lab's engine (input -> rig -> lens -> stabiliser -> recorder) drives the stage's
// view camera. React-free; the pieces that need no WebGL are exported for tests.
import { Quaternion, Vector3, type PerspectiveCamera } from 'three'
import type { OperatorEngine } from '../../controller/engine/engine'
import type { InputState, RigId } from '../../controller/input/types'
import { threeFovDeg } from '../../controller/math/lens'
import type { Stage } from '../engine/Stage'
import { focalFromVfov, toRad } from '../math/camera'

/** The set has no car yet (Layer 3), so no follow rig. */
export const STAGE_RIGS: RigId[] = ['free', 'dolly', 'crane', 'orbit']

/** Focal length (mm, 36 mm-wide sensor) of a three.js camera's vertical fov at its aspect; inverse of threeFovDeg. */
export const focalOfView = (view: PerspectiveCamera) => focalFromVfov(toRad(view.fov), view.aspect)

/** Put the engine's output on the view camera. */
export function applyOut(engine: OperatorEngine, view: PerspectiveCamera) {
  view.position.copy(engine.out.position)
  view.quaternion.copy(engine.out.quaternion)
  const fov = threeFovDeg(engine.out.focal, view.aspect)
  if (view.fov !== fov) {
    view.fov = fov
    view.updateProjectionMatrix()
  }
}

/**
 * Start the engine exactly at the view's pose and lens. The engine zooms 12-85 mm, so a wider or longer view lens is clamped
 * silently (the view takes the clamped lens at once); nothing to warn about, so it returns null.
 */
export function takeOverView(engine: OperatorEngine, view: PerspectiveCamera): string | null {
  const want = focalOfView(view)
  const got = engine.takeOver(view.position, view.quaternion, want)
  if (Math.abs(got - want) >= 0.05) applyOut(engine, view)
  return null
}

/**
 * Per-frame driver for Stage.setDriver. When something else moved the view since the last frame (snap to
 * projector, the orbit buttons, a new source), the engine takes over from there instead of pulling it back.
 */
export function operatorDriver(engine: OperatorEngine, view: PerspectiveCamera, onNote: (note: string) => void) {
  const last = { position: new Vector3(), quaternion: new Quaternion(), fov: NaN }
  const remember = () => {
    last.position.copy(view.position)
    last.quaternion.copy(view.quaternion)
    last.fov = view.fov
  }
  remember()
  return (dt: number) => {
    if (!view.position.equals(last.position) || !view.quaternion.equals(last.quaternion) || view.fov !== last.fov) {
      const note = takeOverView(engine, view)
      if (note) onNote(note)
    }
    engine.tick(dt, view.aspect)
    applyOut(engine, view)
    remember()
  }
}

/** True when this frame's input moves the camera or the lens (focus and the timeline do not). */
export function inputMoves(i: InputState): boolean {
  return i.move.x !== 0 || i.move.y !== 0 || i.lift !== 0 || i.look.x !== 0 || i.look.y !== 0
    || i.mouse.x !== 0 || i.mouse.y !== 0 || i.wheel !== 0 || i.zoomIn > 0 || i.zoomOut > 0
}

/** The operator is driving the camera right now: input, a take recording, a take playing back, or a preset move playing. */
export const operatorActive = (engine: OperatorEngine) =>
  engine.deck.recording || !!engine.deck.playback || !!(engine as { move?: unknown }).move || inputMoves(engine.hub.state)

/**
 * Enter Operator mode on a stage; returns the exit, which hands the camera back to orbit where it is. The input is
 * separate (operatorInput), so the driver can hold the pose while the set is off the page.
 */
export function startOperator(stage: Stage, engine: OperatorEngine, onNote: (note: string) => void): () => void {
  const note = takeOverView(engine, stage.view)
  if (note) onNote(note)
  stage.setDriver(operatorDriver(engine, stage.view, onNote))
  return () => {
    if (engine.deck.recording) engine.stopRecording()
    if (engine.deck.playback) engine.endPlayback()
    stage.setDriver(null)
  }
}

/**
 * The operator's input (keys, mouse, pad) on the stage canvas, only while the set is on this page: off it (Develop,
 * Render) nothing is attached, so T, R, Space, Tab and [ ] stay the page's. The driver keeps the pose meanwhile, so
 * coming back re-attaches with no camera move. Returns the detach, which also leaves pointer lock.
 */
export function operatorInput(stage: Pick<Stage, 'renderer'> & { panes?: Stage['panes'] }, engine: OperatorEngine, onStage: boolean): () => void {
  if (!onStage) return () => {}
  const canvas = stage.renderer.domElement
  const detach = engine.attach(canvas)
  // only a click or wheel turn in the Camera pane is the operator's; the Free and Top panes keep theirs
  const keyboard = engine.hub.keyboard
  keyboard.gate = stage.panes ? (e) => stage.panes!.at(e.clientX, e.clientY) === 'camera' : null
  return () => {
    keyboard.gate = null
    detach()
    if (document.pointerLockElement === canvas) document.exitPointerLock()
  }
}
