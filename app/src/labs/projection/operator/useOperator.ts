import { useCallback, useEffect, useRef, useState } from 'react'
import type { Stage } from '../engine/Stage'
import { operatorActive, operatorInput, STAGE_RIGS, startOperator } from './link'
import { attachOrbitDrag } from './orbitDrag'
import { useLevel } from './useLevel'
import { stagePivotHost } from './orbitPivot'
import { StageOperatorEngine } from './stageEngine'
import { stillTrigger, type StillTriggerDeps } from './stillTrigger'

export type CameraMode = 'orbit' | 'operator'

/**
 * The engine as hosted on the stage: no follow rig, no built-in car (the world's car moves on the world clock, which
 * is the engine's timeline), orbit around the stage's pivot choice, stills through the lab.
 */
class StageEngine {
  private stage: Stage | null = null
  private still: StillTriggerDeps = { blocked: () => 'not ready', take: async () => {} }
  readonly engine = new StageOperatorEngine({
    rigs: STAGE_RIGS,
    rig: 'free',
    car: false,
    onStill: stillTrigger({ blocked: () => this.still.blocked(), take: () => this.still.take(), price: () => this.still.price?.() ?? '' }),
  })

  /** latest stage and still hooks, after each render */
  sync(stage: Stage | null, still: StillTriggerDeps) {
    if (stage !== this.stage) this.engine.pivot.host = stage ? stagePivotHost(stage) : null
    this.stage = stage
    this.still = still
    if (stage) this.engine.bind(stage.world, () => stage.view.aspect)
  }
}

/**
 * Camera mode for the projection lab. Orbit: OrbitControls + fly keys + pivot (default). Operator: the controller
 * engine drives the view; its still button goes through `still` (the lab's Take still with its guards). The input is
 * attached only while `onStage` (the set is on this page).
 */
export function useOperator(stage: Stage | null, still: StillTriggerDeps, onStage = true, sourceId?: string) {
  useLevel(stage, sourceId)
  const [host] = useState(() => new StageEngine())
  useEffect(() => host.sync(stage, still))
  const engine = host.engine
  const [mode, setModeState] = useState<CameraMode>('orbit')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'operator' || !stage) return
    const stop = startOperator(stage, engine, setNote)
    return () => { engine.pivot.endPick(); stop() }
  }, [mode, stage, engine])
  useEffect(() => {
    if (mode !== 'operator' || !stage) return
    return operatorInput(stage, engine, onStage)
  }, [mode, stage, engine, onStage])
  // the Orbit rig's mouse gesture (pivot on mouse down, drag orbits, wheel dollies), only while the set is on the page
  const dragging = useRef<() => boolean>(() => false)
  useEffect(() => {
    if (mode !== 'operator' || !stage || !onStage) return
    const d = attachOrbitDrag(stage, engine)
    dragging.current = d.dragging
    return () => { d.detach(); dragging.current = () => false }
  }, [mode, stage, engine, onStage])

  const setMode = useCallback((m: CameraMode) => { setNote(null); setModeState(m) }, [])
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode })
  /** the operator is moving the camera right now (rest detection counts this as motion) */
  const active = useCallback(() => modeRef.current === 'operator' && (operatorActive(engine) || dragging.current()), [engine])
  return { engine, mode, setMode, note, active }
}
