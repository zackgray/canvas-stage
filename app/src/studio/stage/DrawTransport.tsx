// The draw bar's one-row transport (layout wave L1): Play / Loop / Rewind, the playhead track (flex) and the time readout in a
// single line — the controls with the track between fixed neighbours, so nothing can overlap the playhead. Until a take or a performance is loaded the row is empty. The car's
// speed note stays on the full timeline — the bar's readout is the clock alone. Pass 3: no Clay / Look switch on the Stage; the
// set always shows its look (a clay view left on elsewhere is put back). Play is the shot's (owner 2026-10-28): the action and, on the
// camera, the picked move or the take's own recorded camera (useShotPlan), together from the take's start; Stop ends both and the
// camera goes back to where the shot starts. Rewind and the scrubber stop the camera first.
import { useEffect, type MouseEvent } from 'react'
import { useTicker } from '../../labs/controller/ui/useTicker'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { shotPlaying, stopShot } from '../../labs/projection/operator/shotPlay'
import { useLoopKey } from '../../labs/projection/ui/loopKey'
import { useCurrentTakeId } from '../shoot/currentTake'
import { takeLoadingWords } from './takeLoading'
import { useShotPlan } from './useShotPlan'

export function DrawTransport({ lab }: { lab: ProjectionLabState }) {
  useTicker(15)
  const world = lab.stage?.world ?? null
  useLoopKey(world)
  useShotPlan(lab)
  const cur = useCurrentTakeId()
  const perf = lab.performance
  const loaded = !!lab.op.engine.deck.take || !!cur || !!perf?.selected || !!perf?.layer
  const { set } = lab
  const clay = lab.s.look === 'clay'
  useEffect(() => { if (clay) set({ look: 'textured' }) }, [clay, set])
  if (!loaded || !world) return <div className="st-transport" data-testid="stage-transport" />
  const c = world.clock
  const engine = lab.op.engine
  // the camera plays only under the Operator (the Stage's one camera mode); otherwise Play is the clock's alone
  const play = () => (lab.op.mode === 'operator' ? engine.playPause() : c.toggle())
  const camera = shotPlaying(engine)
  const loading = camera ? null : takeLoadingWords(lab.stage, lab.kit?.id ?? null) // a picked take's own walk or set is still coming onto the stage
  const blur = (e: MouseEvent<HTMLButtonElement>) => e.currentTarget.blur() // L / Space / the camera keys keep working
  return (
    <div className="st-transport" data-testid="stage-transport">
      <button type="button" data-testid="world-play" disabled={!!loading}
        title={loading ?? (camera ? 'Stops the camera and the action' : 'Plays the action with the camera move or the take')}
        onClick={(e) => { play(); blur(e) }}>{camera ? '■ Stop' : c.playing ? '❚❚ Pause' : '▶ Play'}</button>
      <button type="button" className={c.loop ? 'st-transport-on' : undefined} aria-pressed={c.loop} data-testid="world-loop"
        title="Loop (L): at the end, play again from 0. A take (R) always records once."
        onClick={(e) => { c.toggleLoop(); blur(e) }}>⟲ Loop</button>
      <button type="button" data-testid="world-rewind" onClick={(e) => { stopShot(engine); c.rewind(); blur(e) }}>⏮ Rewind</button>
      <input className="st-transport-track" type="range" min={0} max={c.duration} step={1 / 24} value={c.time} aria-label="World time"
        onChange={(e) => { stopShot(engine); c.seek(Number(e.target.value)) }} data-testid="world-scrub" />
      <span className="st-transport-time" data-testid="world-time">{c.time.toFixed(2)} / {c.duration.toFixed(1)} s</span>
    </div>
  )
}
