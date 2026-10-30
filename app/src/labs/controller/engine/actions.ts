// What each edge-triggered action (a button press, a key) does to the operator engine (OperatorEngine.doAction). Moved out of
// engine.ts, which is the frame loop; the host engine (the Stage's) overrides doAction for the actions it hosts differently.
import type { Action, CameraAction, RigId } from '../input/types'
import type { OrbitRig } from '../rigs/orbitRig'
import { togglePlay } from './timeline'
import type { OperatorEngine } from './engine'

export const RELEASED_TEXT = 'Hold released: flying free'
export const ALREADY_FREE_TEXT = 'Already free'

const CAMERA_ACTIONS: readonly CameraAction[] = ['setStart', 'backToStart', 'playTake', 'stopTake', 'aimClear']
const isCameraAction = (a: Action): a is CameraAction => (CAMERA_ACTIONS as readonly Action[]).includes(a)

export function runAction(e: OperatorEngine, a: Action) {
  const ids = e.rigIds
  const i = ids.indexOf(e.rigId)
  if (a.startsWith('rig:')) e.setRig(a.slice(4) as RigId)
  else if (a === 'rigNext') e.setRig(ids[(i + 1) % ids.length])
  else if (a === 'rigPrev') e.setRig(ids[(i + ids.length - 1) % ids.length])
  else if (a === 'record') e.toggleRecording()
  else if (a === 'playPause') togglePlay(e.timeline)
  else if (a === 'release') release(e)
  else if (isCameraAction(a)) e.onCameraAction?.(a)
  else if (a === 'rewind') {
    if (!e.deck.recording) e.timeline.time = 0
  } else if (a === 'smoothing') {
    e.stabiliser.enabled = !e.stabiliser.enabled
    e.flash(`Smoothing ${e.stabiliser.enabled ? 'on' : 'off (raw handheld)'}`)
  } else if (a === 'followMode') {
    e.followMode = e.followMode === 'pan' ? 'chase' : 'pan'
    e.flash(`Follow: ${e.followMode === 'pan' ? 'pan from fixed position' : 'chase'}`)
  } else if (a === 'recenter') {
    // the gyro always recentres; the orbit pivot only on the Orbit rig, never mid-take (the flash says which)
    e.hub.dualsense.recenter()
    const orbit = e.rigId === 'orbit'
    const moved = e.retargetOrbit(e.options.orbitRecentre ?? e.options.orbitTarget, false)
    const d = moved ? e.out.position.distanceTo((e.rigs.orbit as OrbitRig).target).toFixed(1) : ''
    e.flash(!orbit ? 'Gyro recentred (pivot is for the Orbit rig)'
      : e.deck.recording ? 'Recentred (orbit pivot holds while recording)'
      : moved ? `Recentred on the orbit pivot · ${d} m` : 'Gyro recentred')
  } else if (a === 'still') {
    const still = { timelineTime: e.timeline.time, focal: e.focal, rig: e.rigId }
    if (e.options.onStill) {
      const r = e.options.onStill(still)
      if (r.taken) {
        e.stills.push(still)
        e.deck.recorder.mark('still')
      }
      return e.flash(r.message)
    }
    e.stills.push(still)
    e.deck.recorder.mark('still')
    console.info('[controller-lab] still', e.stills[e.stills.length - 1])
    e.flash(`Still #${e.stills.length} at ${e.timeline.time.toFixed(2)} s`)
  }
}

/**
 * Create / Esc: let go of a held camera, both thumbs staying on the sticks. The host's hold goes first (the Stage: its Hold tick and
 * a move playing or filming, through onRelease); then a replay stops where the camera is now (no jump back to the take's start),
 * and the rig becomes Free so the sticks fly it from there. A hand-flown take recording keeps recording. The flash says which.
 */
function release(e: OperatorEngine) {
  const held = e.onRelease()
  const replaying = !!e.deck.playback
  if (replaying) {
    const at = { position: e.out.position.clone(), quaternion: e.out.quaternion.clone(), focal: e.out.focal }
    e.endPlayback()
    e.takeOver(at.position, at.quaternion, at.focal)
  }
  const rigged = e.rigId !== 'free' && e.rigIds.includes('free')
  if (rigged) e.setRig('free')
  e.flash(held || replaying || rigged ? RELEASED_TEXT : ALREADY_FREE_TEXT)
}
