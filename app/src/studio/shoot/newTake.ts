// New take (owner 10-29: "clicking New take should duplicate what's up, including prop locations etc., then I'm free to move that,
// and can toggle back to Shot 1"). Both presses (the Camera panel's "Take locked · New take" and the take list's "+ New take") start
// an open take from what is on screen and record nothing: a locked take on show whose walk or set is not the scene's has them copied
// into the scene first (the server's own writers, so the takes still on the scene's walk and set adopt them before the write; the
// locked takes themselves are never written), then that take is set aside and the open take is current, editable. The camera stays
// where it is. A recording in memory that is not locked is dropped, after the owner says so (the caller's ask).
import { useState } from 'react'
import type { KitPerformance } from '../../../server/stage3d/types'
import { currentSceneId } from '../../library/currentScene'
import { saveKitPerformance, saveKitPlan } from '../../labs/projection/stage3d/kitApi'
import { takeOnShow, takeOnShowFor } from '../../labs/projection/stage3d/takeOnShow'
import type { ScenePlan } from '../../stage3d/contract'
import { mocapPackId } from '../../stage3d/planHash'
import { withSceneCast } from '../../shared/takePerfContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { setKeyOf } from './setKey'
import { openSceneTake } from './takeShow'
import { clearUnlocked } from './unlockedTake'

export const NEW_TAKE_TITLE = 'Starts a new take from what\'s on screen; nothing is recorded until you press Record. Your saved takes stay as they are.'
export const NEW_TAKE_ASK = 'Start a new take? The unlocked recording will be dropped.'

export interface NewTakeDeps {
  deck: { recording: boolean; take: unknown; playback: unknown }
  worldId: string | null
  /** the scene's own walk and set (useKit world.perf, scenePlan), never the take on show's */
  scenePerf: KitPerformance | null
  scenePlan: ScenePlan | null
  savePlan?: typeof saveKitPlan
  savePerf?: typeof saveKitPerformance
}

/** Start the open take from what is on screen. Resolves false (nothing set aside, nothing dropped) when a copy is refused. */
export async function startNewTake(d: NewTakeDeps): Promise<boolean> {
  const world = d.worldId
  if (!world || d.deck.recording) return false
  const s = takeOnShowFor(takeOnShow(), world)
  // the set first: a new mark moves the walk's start, and the take's own walk (saved next) begins on the take's mark
  if (s?.plan && setKeyOf(s.plan) !== setKeyOf(d.scenePlan)) await (d.savePlan ?? saveKitPlan)(world, s.plan)
  if (s?.perf && (!d.scenePerf || mocapPackId(s.perf) !== mocapPackId(d.scenePerf))) {
    await (d.savePerf ?? saveKitPerformance)(world, withSceneCast(s.perf, d.scenePerf)) // who plays the hero stays the scene's choice
  }
  d.deck.take = null // the take in memory (locked or not) leaves the deck: the next Record fills the open take
  d.deck.playback = null
  const scene = currentSceneId()
  if (scene) clearUnlocked(scene) // so a reload does not put a dropped recording back
  openSceneTake(world)
  return true
}

/** One New take press with its ask: `press` asks first while an unlocked recording is in memory, else starts at once. */
export function useNewTake(lab: ProjectionLabState, unlocked: boolean) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setAsking(false)
    if (busy) return
    setBusy(true); setError(null)
    try {
      await startNewTake({ deck: lab.op.engine.deck, worldId: lab.kit?.id ?? lab.s.source ?? null, scenePerf: lab.kit?.world?.perf ?? null, scenePlan: lab.kit?.scenePlan ?? null })
    } catch (e) { setError(`The new take could not start: ${e instanceof Error ? e.message : String(e)}`) }
    setBusy(false)
  }
  return {
    asking, busy, error,
    press: () => { if (lab.op.engine.deck.recording) return; if (unlocked) setAsking(true); else void go() },
    confirm: () => void go(),
    cancel: () => setAsking(false),
  }
}
