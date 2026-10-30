// Viewfinder overlay: thirds, rig, lens, timeline and the record light.
import type { OperatorEngine } from '../engine/engine'
import { hfovFromFocal } from '../math/lens'

const DEG = 180 / Math.PI

/** `plain`: the Stage's viewfinder — no operator readouts (the stabiliser's amount) over the picture */
export function Hud({ engine, plain = false }: { engine: OperatorEngine; plain?: boolean }) {
  const rig = engine.rigs[engine.rigId]
  const deck = engine.deck
  const tl = engine.timeline
  const pb = deck.playback
  return (
    <div className="cl-hud">
      <div className="cl-thirds" />
      <div className="cl-hud-top">
        <span>
          {rig.label}
          {engine.rigId === 'follow' && ` · ${engine.followMode}`}
        </span>
        <span>
          {engine.out.focal.toFixed(0)} mm · {(hfovFromFocal(engine.out.focal) * DEG).toFixed(1)}° H
        </span>
        {!plain && <span>{engine.stabiliser.enabled ? `stabilised ${engine.stabiliser.amount.toFixed(2)}` : 'handheld (raw)'}</span>}
      </div>
      {deck.recording && (
        <div className="cl-rec" data-testid="rec-indicator">
          ● REC {deck.recorder.elapsed.toFixed(2)} / {deck.recorder.capSeconds.toFixed(1)} s
        </div>
      )}
      {pb && (
        <div className="cl-play">
          ▶ {pb.track} {pb.t.toFixed(2)} s
        </div>
      )}
      {engine.message && <div className="cl-msg">{engine.message}</div>}
      <div className="cl-timeline">
        <div className="cl-timeline-fill" style={{ width: `${(tl.time / tl.duration) * 100}%` }} />
        <span>
          {tl.playing ? '▶' : '❚❚'} {tl.time.toFixed(2)} / {tl.duration.toFixed(0)} s{engine.hasCar && ` · car ${engine.car.speed.toFixed(1)} m/s`}
        </span>
      </div>
    </div>
  )
}
