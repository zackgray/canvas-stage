// The Camera panel (the Stage simplification): the Camera view's right panel with nothing picked — the one camera mode (the
// Operator) and what it films. The shot length (2 / 4 / 6 / 8 s), the camera move grid with Hold on and Preview, Record (its
// render price on the label), then Lock take and who plays the subject when the scene has more than one cast. Flying by hand
// stays in the Camera pane (W A S D + mouse, R records); the rig choice, the takes list and the Advanced drawer are not on the
// Stage. Also the camera's start ("Set start here" / "Back to start", kept per scene in the Stage memory), Play take with its
// scrub bar, the aim lock's picker, and one "Take locked · New take" line. Only camera things (owner 10-29): the first frame's
// draw is the take card's beside the Prompt box, its look and Render clip the first-frame window's. DOM only: nothing here enters
// the lab scene.
import { useTicker } from '../../../labs/controller/ui/useTicker'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { Ask } from '../../ui'
import { heroTag, tagSaid, useWorldBible } from '../../shoot/castNames'
import { useMemoryTakeLocked, useCurrentTakeId } from '../../shoot/currentTake'
import { PlayedByAsk } from '../../shoot/playedBy'
import { canPreset, PresetMoves } from '../../shoot/PresetMoves'
import { ShotLength } from '../../shoot/ShotLength'
import { TakeLockBlock } from '../../shoot/TakeLockBlock'
import { NEW_TAKE_ASK, NEW_TAKE_TITLE, useNewTake } from '../../shoot/newTake'
import { useRecordGuard, useRecordKey } from '../../shoot/useRecordGuard'
import { useShotLength } from '../../shoot/useShotLength'
import { StepCue, useShotStep } from './ShotSteps'
import { AimLock } from './AimLock'
import { TakePlay } from './TakePlay'
import { useSavedCamera } from '../useSavedCamera'
import { setStageMemo, useStageMemo } from '../stageMemory'
import '../stagePanes.css'

export function CameraPanel({ lab }: { lab: ProjectionLabState }) {
  useTicker(10) // the move's clock and the deck are the mutable engine's: sample them
  const shot = useShotLength(lab)
  const engine = lab.op.engine
  const deck = engine.deck
  const memo = useStageMemo() // the scene's: the Fly switch, the camera's start, the aim lock (a tab switch keeps them)
  const fly = memo.fly
  // recorded, not locked (or changed since): filming again asks before replacing it
  const memoryLocked = useMemoryTakeLocked()
  const unlocked = !!deck.take && !memoryLocked
  const current = useCurrentTakeId()
  const lockedShown = !!current && !unlocked // a locked take is on show (the memory one or the disk one after a reload)
  const rec = useRecordGuard(deck, unlocked, shot.waitNow)
  useRecordKey(rec.press, () => engine.toggleRecording())
  const bible = useWorldBible(lab.kit?.id)
  const heroT = heroTag(bible, lab.kit?.perf?.castId ?? null)
  const hero = heroT ? tagSaid(bible, heroT) : null // the plain name ("Julia"), never "@julia"
  const step = useShotStep(lab) // Record, then Lock take: the yellow press only while it is the next step
  const cam = useSavedCamera(lab)
  const nt = useNewTake(lab, unlocked)
  return (
    <div className="st-scene" data-testid="scene-panel">
      <section className="st-scene-card st-cam-card" data-testid="card-shot">
        <h2>The shot</h2>
        <ShotLength shot={shot} />
        {lab.op.note && <p className="st-warn">{lab.op.note}</p>}
        {rec.asking && (
          <p><Ask label="Replace the unlocked take" yes="Record again" no="Keep it" testId="record-ask" onYes={rec.confirm} onNo={rec.cancel}>
            The take you just made is not locked. Filming again replaces it.</Ask></p>
        )}
        {rec.note && <p className="st-warn" role="status" data-testid="record-note">{rec.note}</p>}
        {canPreset(engine) && <PresetMoves engine={engine} press={rec.press} hero={hero} secs={shot.value} wait={shot.wait} primary={step === 'record'} fly={fly} onFly={(on) => setStageMemo({ fly: on })} aim={<AimLock lab={lab} />} />}
        {/* Record (in the moves above), Set start here / Back to start and Lock take: one stack, equal gaps, the prices in one column, one status line */}
        <div className="st-cam-commit" data-testid="camera-commit">
          <button type="button" className="st-btn" data-testid="camera-set-start" disabled={deck.recording}
            title="Keeps the camera's place, turn and lens as this scene's start (also while flying free)" onClick={cam.saveStart}>Set start here</button>
          {cam.saved && (
            <button type="button" className="st-btn" data-testid="camera-return" disabled={deck.recording || !!engine.move}
              title="Puts the camera back on the scene's start (its place, turn and lens)" onClick={cam.restore}>Back to start</button>
          )}
          {/* (owner 10-29) one take-locked line with its New take press: it starts an open take from what is on screen (the take's
              walk and set copied into the scene) and records nothing (newTake.ts); the locked take stays as it is */}
          <TakeLockBlock lab={lab} primary={step === 'lock'} cue={(step === 'record' || step === 'lock') && <StepCue step={step} cameraView />}
            locked={lockedShown ? <span data-testid="camera-new-take">Take locked ·{' '}
              <button type="button" className="st-link" data-testid="camera-new-take-btn" disabled={deck.recording || nt.busy}
                title={NEW_TAKE_TITLE} onClick={nt.press}>New take</button></span> : null} />
          {nt.asking && <p><Ask label="Start a new take" yes="New take" no="Cancel" testId="camera-new-take-ask" onYes={nt.confirm} onNo={nt.cancel}>{NEW_TAKE_ASK}</Ask></p>}
          {nt.error && <p className="st-warn" role="alert" data-testid="camera-new-take-error">{nt.error}</p>}
        </div>
        <label className="st-field-hint" data-testid="camera-auto-start-wrap">
          <input type="checkbox" data-testid="camera-auto-start" checked={memo.autoStart}
            onChange={(e) => setStageMemo({ autoStart: e.target.checked })} /> Back to start when a recording begins
        </label>
        <TakePlay lab={lab} />
        <PlayedByAsk lab={lab} />
      </section>
    </div>
  )
}
