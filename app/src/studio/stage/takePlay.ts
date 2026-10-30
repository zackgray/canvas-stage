// Play take / Stop / scrub for the Camera panel (camera-take-playback): replays the recorded camera path in the viewport —
// the camera, lens and focus as recorded, the subject's motion in step on the world clock — with nothing rendered. Loop on
// actually loops the take (the engine rewinds it; takeDeck.ts). Stop ends the replay and puts the camera back where the user
// was before it played, else on the scene's start (camera-start-point). The scrub bar seeks the running playback.
import type { StageOperatorEngine } from '../../labs/projection/operator/stageEngine'
import { playShot } from '../../labs/projection/operator/shotPlay'
import { stageMemo, type CameraPose } from './stageMemory'
import { returnTo } from './useSavedCamera'

/** the camera pose Play take found, to put back on Stop; null after a Stop or when the replay was never ours */
let resume: CameraPose | null = null

/** a take is replaying in the viewport now */
export const takePlaying = (engine: StageOperatorEngine): boolean => !!engine.deck.playback && !engine.deck.recording

/** the running replay's place: seconds in and the take's length, or null when nothing plays. */
export function takePlace(engine: StageOperatorEngine): { t: number; end: number } | null {
  const end = engine.deck.playbackEnd()
  return engine.deck.playback && end !== null ? { t: engine.deck.playback.t, end } : null
}

/** Start the replay of the take the Stage's plan points at (the locked take on show, else the one in memory). False when there
 *  is no take to play, one plays already, or a take records. The camera's pose now is kept for Stop. */
export function playTakeNow(engine: StageOperatorEngine): boolean {
  if (engine.deck.recording || takePlaying(engine)) return false
  const plan = engine.shotPlan?.()
  if (!plan || plan.kind === 'move') return false
  const p = engine.out.position
  const q = engine.out.quaternion
  const before = { position: [p.x, p.y, p.z] as [number, number, number], quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number], focal: engine.focal, focus: engine.focus }
  if (!playShot(engine, plan)) return false
  resume = before
  return true
}

/** Stop the replay: the camera back where the user was before it played, else on the scene's start; nothing playing is a no-op. */
export function stopTakeNow(engine: StageOperatorEngine): void {
  if (!takePlaying(engine)) return
  engine.endPlayback()
  const back = resume ?? stageMemo().start
  resume = null
  if (back) returnTo(engine, back)
}

/** Scrub the running replay to `t` seconds into the take (the world clock follows; nothing when no replay runs). */
export function scrubTake(engine: StageOperatorEngine, t: number): void {
  if (takePlaying(engine)) engine.seekPlayback(t)
}

/** tests only */
export const resetTakePlay = (): void => { resume = null }
