// Play take for the Camera panel (camera-take-playback): replays the recorded camera path in the viewport — the camera, lens
// and focus as recorded, the subject's motion in step on the world clock — with nothing rendered, in every view, and a scrub bar
// over the take while it plays. Loop on actually loops it (the engine rewinds the playback). DOM only: the replay is the
// engine's (takePlay.ts), this is the press and the bar.
import { useTicker } from '../../../labs/controller/ui/useTicker'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { playTakeWhenReady } from '../takePerformer'
import { takeLoadingWords } from '../takeLoading'
import { scrubTake, stopTakeNow, takePlace, takePlaying } from '../takePlay'

export function TakePlay({ lab }: { lab: ProjectionLabState }) {
  useTicker(10) // the deck is the mutable engine's: sample it
  const engine = lab.op.engine
  const playing = takePlaying(engine)
  const place = takePlace(engine)
  const plan = !engine.deck.recording && !playing ? engine.shotPlan?.() : null
  const canPlay = !!plan && plan.kind !== 'move'
  const loading = canPlay ? takeLoadingWords(lab.stage, lab.kit?.id ?? null) : null // the take's own walk or set is still being put on the stage
  return (
    <div className="sd-act" data-testid="take-play">
      <button type="button" className="st-btn" data-testid="play-take" disabled={!canPlay || !!loading}
        title={loading ?? "Replays the recorded camera path in the viewport with the action, nothing rendered"} onClick={() => void playTakeWhenReady(engine, lab.stage, lab.kit?.id ?? null)}>
        {playing ? 'Playing the take…' : 'Play take'}
      </button>
      {playing && place && (
        <input type="range" data-testid="take-scrub" min={0} max={place.end} step={0.05} value={Math.round(place.t * 20) / 20}
          onChange={(e) => scrubTake(engine, Number(e.target.value))} aria-label="Scrub the take" />
      )}
      {playing && (
        <button type="button" className="st-btn" data-testid="stop-take" onClick={() => stopTakeNow(engine)}>Stop</button>
      )}
    </div>
  )
}
