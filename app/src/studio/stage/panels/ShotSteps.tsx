// The shot's next step under the right panel (the Stage simplification; owner 10-29): one quiet line saying what comes next, and
// the 3D-piece-building note. The presses are no longer here: Record and Lock take are the Camera panel's, Draw the first frame is
// the take card's beside the Prompt box (TakeCard.tsx), and picking a version, Draw another and Render clip live in the first-frame
// window (FrameEditDock.tsx). There is no Approve: the version selected in the window is the frame in use.
import { useTicker } from '../../../labs/controller/ui/useTicker'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { useCurrentTakeId, useMemoryTakeLocked } from '../../shoot/currentTake'
import { useHeroPublished } from '../../shoot/heroPublished'
import { shotStep, stepCue, type ShotStep } from '../shotStep'
import { useStageScene } from '../scene/StageScene'
import { useWordsFact } from '../useWordsFact'
import { PIECE_BUILDING, usePieceBuilding } from '../pieceBuilding'

/** the one next step, read the same way by the Camera panel (Record, Lock take) and the line below the panel */
export function useShotStep(lab: ProjectionLabState): ShotStep {
  useTicker(4) // the recorded take lives in the mutable engine: sample it
  const current = useCurrentTakeId()
  const memoryLocked = useMemoryTakeLocked()
  const o = useHeroPublished()?.overlay ?? null
  const st = useStageScene()
  const unlocked = !!lab.op.engine.deck.take && !memoryLocked
  const worldId = lab.kit?.id ?? null
  const words = useWordsFact(st ? st.x.s.d.brief : null, worldId) // the take's words when one is on show
  const world = lab.kit?.world && lab.kit.world.id === worldId ? lab.kit.world : null
  return shotStep({
    // no design read yet (no provider): nothing is claimed, the shot steps stand as they were
    words,
    placed: (world?.plan.kit.length ?? 0) > 0,
    // no first-words card to choose a way forward on any more: words written are the go-ahead to record (as Continue was)
    chosen: true,
    locked: !!current && !unlocked,
    unlocked,
    still: !o ? 'none' : o.approved ? 'approved' : 'awaiting',
  })
}

export const StepCue = ({ step, cameraView }: { step: ShotStep; cameraView: boolean }) =>
  <p className="st-muted st-step-cue" data-testid="step-cue">{stepCue(step, cameraView)}</p>

export function ShotSteps({ lab, cameraView = false }: { lab: ProjectionLabState; cameraView?: boolean }) {
  const step = useShotStep(lab)
  const building = usePieceBuilding(lab.kit?.id ?? null)
  // the Camera panel says Record and Lock take's own cue beside those presses
  const cue = !(cameraView && (step === 'record' || step === 'lock'))
  return (
    <section className="st-scene-card st-shot-steps" data-testid="shot-steps">
      {building && <p className="st-warn" role="status" data-testid="piece-building">{PIECE_BUILDING}.</p>}
      {cue && <StepCue step={step} cameraView={cameraView} />}
    </section>
  )
}
