import { useEffect, type ReactNode } from 'react'
import { PRESETS } from '../../labs/projection/operator/presetMoves'
import type { StageOperatorEngine } from '../../labs/projection/operator/stageEngine'
import { RowHead } from '../Seg'
import { cueOf, setStageMemo, useStageMemo } from '../stage/stageMemory'
import { PriceButton } from '../ui'
import { useCurrentTakeId } from './currentTake'
import { HandFlyRow } from './HandFlyRow'

/** said under the moves while Play replays the take's own camera rather than a move */
export const TAKE_CUED = "Play replays the take's camera with the action. Pick a move to play that instead."

/** focus off the pressed button, so R (the camera's key) works next, as after a Seg press */
const blurFocus = () => (document.activeElement as HTMLElement | null)?.blur?.()

/** Record's label: the length ("Record · 6 s"); recording is free ("Free" beside it), the render's price is on Render alone */
export const recordLabel = (secs: number | null): string => ['Record', ...(secs === null ? [] : [`${secs} s`])].join(' · ')

/** the stage's engine plays preset moves; a plain operator engine (the controller lab, tests) does not */
export const canPreset = (e: object): e is StageOperatorEngine => typeof (e as StageOperatorEngine).startPreset === 'function'

/**
 * The Camera panel's camera moves (no controller needed): pick a move, Play it with the action from the transport (owner 2026-10-28:
 * Preview folded into Play), then Record it as a take of the shot length (`secs`: one value with the motion and the render; null =
 * none picked yet, so nothing plays). The take is recorded by the same recorder a hand-flown take uses, so Lock, the frames and
 * Render take it unchanged. The picked move, the hold and what Play plays (the move, or the take's own camera) are the scene's
 * Stage memory (stageMemory.ts), so a tab switch keeps them.
 */
export function PresetMoves({ engine, press, hero = null, secs, wait = null, primary = true, fly = false, onFly, aim = null }: {
  engine: StageOperatorEngine; press: (action: () => void) => void
  /** Fly it yourself is on: Record films the hand-flown path (the engine's own recording); a move pick turns it off. `onFly`
   *  absent = no Fly it yourself row */
  fly?: boolean; onFly?: (on: boolean) => void
  /** the aim picker, shown right under Fly it yourself and only while flying (mounted only then, so a hidden aim never acts) */
  aim?: ReactNode
  /** Record is the yellow press (the Stage: only while recording is the next step) */
  primary?: boolean
  /** the shot length (s), or null when none is picked yet */
  secs: number | null
  /** why Record waits (the performer is being rebuilt to the shot length), or null */
  wait?: string | null
  /** the hero's plain name, to name the hold ("Hold on Maria", "Hold on the beekeeper"); none = "Hold on the subject" */
  hero?: string | null
}) {
  const memo = useStageMemo()
  const { move: id, hold } = memo
  const current = useCurrentTakeId()
  const hasTake = !!engine.deck.take || !!current
  const cue = cueOf(memo, hasTake)
  // Play reads the length from here while the panel is up, and from the scene's memory when it is not
  useEffect(() => { setStageMemo({ secs }) }, [secs])
  const m = engine.move
  // Hold on: ticking it turns the camera to centre the subject now and keeps it there, every frame of any move
  const holding = hold && engine.hasSubject
  const who = hero?.trim() || 'the subject'
  const busy = !!m || engine.deck.recording
  const replaying = (!!m && !m.record) || !!engine.deck.playback // Play's own run: Stop ends it
  const onFlyCue = onFly && ((on: boolean) => { setStageMemo({ cue: on ? 'take' : 'move' }); onFly(on) })
  // recording goes through the record guard (no double-press, an unlocked take is asked about)
  const record = () => {
    if (secs === null) return
    setStageMemo({ cue: 'move' }) // the move being filmed shows as picked; its finished take is cued then (useShotPlan)
    // held: the move starts centred on the subject, wherever the camera was flown since the tick
    press(() => { if (hold) engine.aimAtSubject(); engine.startPreset(id, secs, true, holding); blurFocus() })
  }
  const on = (pid: string) => !fly && cue === 'move' && pid === id
  return (
    <section className="st-presets" data-testid="presets">
      <RowHead title="Camera move" />
      <div className="st-preset-grid" role="group" aria-label="Camera move">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={`st-btn${on(p.id) ? ' st-seg-on' : ''}`} aria-pressed={on(p.id)} title={p.title} disabled={busy}
            data-testid={`preset-${p.id}`} onClick={() => { setStageMemo({ move: p.id, cue: 'move' }); onFly?.(false); blurFocus() }}>{p.label}</button>
        ))}
      </div>
      {engine.hasSubject && !fly && (
        <label className="st-check" title={`Camera moves: turns the camera to centre ${who} now and keeps ${who} centred through every move`}>
          <input type="checkbox" data-testid="preset-hold-subject" checked={hold} disabled={busy}
            onChange={(e) => { setStageMemo({ hold: e.target.checked }); if (e.target.checked) engine.aimAtSubject() }} /> Moves stay on {who}
        </label>
      )}
      {onFlyCue && <HandFlyRow engine={engine} fly={fly} onFly={onFlyCue} disabled={busy} />}
      {fly && aim}
      {!fly && cue === 'take' && <p className="st-muted" data-testid="preset-cue-take">{TAKE_CUED}</p>}
      {fly ? (
        <div className="st-actions">
          <PriceButton primary={primary || engine.deck.recording} verb={engine.deck.recording ? 'Stop' : recordLabel(secs)} price={engine.deck.recording ? null : 'Free'} testId="preset-record"
            disabled={!engine.deck.recording && (!!m || !!wait)} onClick={() => press(() => { engine.toggleRecording(); blurFocus() })}
            title={wait ?? (engine.deck.recording ? 'Stops the take here; what was flown is kept' : 'Films the path you fly as a take, the action playing from the start (R does the same)')} />
        </div>
      ) : (
      <div className="st-actions">
        {replaying && <button type="button" className="st-btn" data-testid="preset-stop" title="Stops the camera and the action; the camera goes back to the shot's start"
          onClick={() => { engine.playPause(); blurFocus() }}>Stop</button>}
        {m?.record
          ? <PriceButton primary verb="Stop" price={0} testId="preset-record" onClick={() => press(() => { engine.stopPreset(); blurFocus() })} title="Stops the take here; what was filmed is kept" />
          : <PriceButton primary={primary} verb={recordLabel(secs)} price="Free" testId="preset-record" disabled={busy || secs === null || !!wait} onClick={record}
            title={wait ?? (secs === null ? 'Pick a shot length first' : `Films the move as a take of ${secs} s, the action playing from the start`)} />}
      </div>
      )}
      {wait && !m && <p className="st-muted" role="status" data-testid="preset-wait">{wait}</p>}
      {m && <p className="st-muted" role="status" data-testid="preset-playing">{m.record ? 'Recording' : 'Playing'} {m.label.toLowerCase()} · {m.t.toFixed(1)} / {m.seconds} s</p>}
    </section>
  )
}
