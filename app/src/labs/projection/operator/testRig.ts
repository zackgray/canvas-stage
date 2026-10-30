// Test helpers: an engine hosted like the stage hosts it, with scripted input instead of devices.
import { PerspectiveCamera, Vector3 } from 'three'
import { OperatorEngine } from '../../controller/engine/engine'
import type { EngineOptions } from '../../controller/engine/options'
import { emptyInput, type InputState } from '../../controller/input/types'
import { threeFovDeg } from '../../controller/math/lens'
import { STAGE_RIGS } from './link'

export const ASPECT = 16 / 9
export const FRAME = 1 / 60

/** Engine with the stage's options; returns it with the input it reads every tick (edit it between frames). */
export function scriptedEngine(extra: EngineOptions = {}) {
  const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, ...extra })
  const input: InputState = emptyInput()
  engine.hub.poll = () => {
    engine.hub.state = { ...input, actions: new Set(input.actions) }
    input.actions.clear()
    return engine.hub.state
  }
  return { engine, input }
}

/** A view camera like the stage's, near the projector, looking into the set at a 35 mm lens. */
export function stageView(): PerspectiveCamera {
  const view = new PerspectiveCamera(threeFovDeg(35, ASPECT), ASPECT, 0.02, 2000)
  view.position.set(0.4, 1.6, 0.5)
  view.lookAt(new Vector3(-0.5, 1.1, -6))
  view.updateMatrixWorld(true)
  return view
}
