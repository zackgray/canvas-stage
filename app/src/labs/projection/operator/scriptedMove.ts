// A preset move played by the stage's operator engine (StageOperatorEngine.startPreset): the camera follows the path on the world
// clock, from 0 like any take; Record also runs the deck's recorder over it, so the take is the same 24 fps samples, smoothing,
// keyframes and world track a hand-flown take gets. When it ends (or R stops it) the camera goes back to the move's frame 0 (its
// framing, held on the subject when Hold on is ticked), so Play then Record films the same move and nothing swings at the end.
import { Quaternion, Vector3 } from 'three'
import type { OperatorEngine } from '../../controller/engine/engine'
import { advanceTimeline } from '../../controller/engine/timeline'
import { PRESETS, presetPath, type PresetId, type PresetPose, type PresetStart } from './presetMoves'

export interface ScriptedMove {
  id: PresetId
  label: string
  seconds: number
  /** take time played so far (s) */
  t: number
  record: boolean
  at: (t: number) => PresetPose
  /** the move's frame 0: the camera returns there afterwards, so Play then Record films the same move */
  home: { position: Vector3; quaternion: Quaternion; focal: number }
}

/** Begin a move from the engine's camera now. Starting a take rewinds the world to 0, as Record always does. */
export function presetStartOf(e: OperatorEngine, target: Vector3 | null, subject?: PresetStart['subject']): PresetStart {
  const o = e.out
  return { position: [o.position.x, o.position.y, o.position.z], quaternion: [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w],
    focal: o.focal, focus: e.focus, target: target ? [target.x, target.y, target.z] : null, subject }
}

/** `hold`: pull-out / pan / orbit aim every sample at the performer's chest (`start.subject`) */
export function beginMove(e: OperatorEngine, id: PresetId, seconds: number, record: boolean, start: PresetStart, hold = false): ScriptedMove {
  const at = presetPath(id, start, seconds, hold), p0 = at(0)
  const move: ScriptedMove = { id, label: PRESETS.find((p) => p.id === id)?.label ?? id, seconds, t: 0, record, at,
    home: { position: new Vector3(...p0.position), quaternion: new Quaternion(...p0.quaternion), focal: p0.focal } }
  if (e.deck.playback) e.endPlayback()
  e.timeline.time = 0
  e.timeline.playing = true
  if (record) {
    e.deck.recorder.setDefaultCap(seconds) // the take is exactly the move's length
    e.deck.start(move.at(0), { timelineStart: 0, rig: move.label, smoothingAmount: 0 })
  }
  return move
}

/** One frame of the move; returns true when it has ended (the caller then calls endMove). R stops it early; so does Play (Space)
 *  while it plays without filming. Release (Create / Esc) is the engine's: it stops the move where the camera is. */
export function stepMove(e: OperatorEngine, m: ScriptedMove, dtRaw: number): boolean {
  const input = e.hub.poll(Math.min(dtRaw, 0.1)) // the pad and keys are read so nothing queues up, but only R, Play and Release act
  if (input.actions.has('release')) { e.doAction('release'); return false }
  if (input.actions.has('record') || (!m.record && input.actions.has('playPause'))) return true
  const t = Math.min(m.seconds, m.t + Math.min(dtRaw, 0.1))
  const dt = t - m.t
  m.t = t
  advanceTimeline(e.timeline, dt, true)
  const p = m.at(t)
  e.out.position.fromArray(p.position)
  e.out.quaternion.fromArray(p.quaternion)
  e.out.focal = p.focal
  e.focal = p.focal
  if (p.focus !== undefined) e.focus = p.focus
  if (m.record && e.deck.recording) e.deck.tick(dt, { position: p.position, quaternion: p.quaternion, focal: p.focal }) // the recorder's clock is the move's: its last sample is the move's end
  return t >= m.seconds - 1e-9
}

/** The move is over: a recording becomes the take (the engine's own stop, with the world track), and the camera goes home. */
export function endMove(e: OperatorEngine, m: ScriptedMove) {
  if (e.deck.recording) e.stopRecording()
  else e.timeline.playing = false
  e.takeOver(m.home.position, m.home.quaternion, m.home.focal)
}
