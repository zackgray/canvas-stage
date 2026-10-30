// Play for the whole shot (owner 2026-10-28: Play ran the action alone; a camera move played only through the Camera panel's own
// Preview, and a locked take's flown camera never replayed). The Stage hands the engine a plan (StageOperatorEngine.shotPlan) and
// Play runs it with the action, both from the take's start on the world clock: the picked preset move (filming nothing), the
// locked take's own recorded camera samples, or the take in the engine's memory. Stop ends it and the camera goes back to where the
// shot starts (a move's frame 0, the take's first sample). React-free.
import { Quaternion, Vector3 } from 'three'
import type { CameraSample } from '../../controller/take/types'
import type { PresetId } from './presetMoves'
import type { StageOperatorEngine } from './stageEngine'

export type ShotPlan =
  /** a preset move over `seconds`, held on the subject when `hold` */
  | { kind: 'move'; id: PresetId; seconds: number; hold: boolean }
  /** a locked take's own camera samples (seconds from the take start), from `start` on the world clock */
  | { kind: 'take'; samples: CameraSample[]; start: number }
  /** the take in the engine's memory (just filmed, locked or not) */
  | { kind: 'memory' }

/** what Play started and Stop ends: a move playing without filming, or a take replaying (a move filming is Record's) */
export const shotPlaying = (e: StageOperatorEngine): boolean => (!!e.move && !e.move.record) || !!e.deck.playback

/** the camera at a sample, nothing recorded */
const placeAt = (e: StageOperatorEngine, s: CameraSample) => {
  e.takeOver(new Vector3(...s.position), new Quaternion(...s.quaternion), s.focal)
  if (s.focus !== undefined) e.focus = s.focus // an older take carries its focus: it is where the camera aims
}

/** Start the plan. False when it cannot run (a take records, a move plays, a take too short to play). */
export function playShot(e: StageOperatorEngine, plan: ShotPlan): boolean {
  if (e.deck.recording || e.move) return false
  if (plan.kind === 'move') {
    if (plan.hold) e.aimAtSubject() // the move starts centred on the subject, wherever the camera was flown since the tick
    return e.startPreset(plan.id, plan.seconds, false, plan.hold)
  }
  const samples = plan.kind === 'take' ? plan.samples : e.deck.trackSamples('smoothed')
  if (!samples || samples.length < 2) return false
  placeAt(e, samples[0]) // the replay starts, and Stop or its end comes back, where the take starts
  if (plan.kind === 'take') e.playRecord(samples, plan.start)
  else e.playTake('smoothed')
  return !!e.deck.playback
}

/** Stop what Play started (a filming move is left to Record's Stop). */
export function stopShot(e: StageOperatorEngine): void {
  if (e.move && !e.move.record) e.stopPreset()
  else if (e.deck.playback) e.endPlayback()
}
