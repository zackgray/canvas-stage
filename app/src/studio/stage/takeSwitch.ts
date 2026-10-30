// Switching takes from the Stage's take list: the existing pick (Render's shots list, l2rStore.pick) puts the take on show for the
// still, Render, Export and the overlay and remembers it for the world; the camera then goes to where that take starts, and Play
// replays that take's own camera (the same as "Back to start" on a take). Nothing switches while the camera records.
import type { OperatorEngine } from '../../labs/controller/engine/engine'
import type { TakeRecord } from '../../shared/shotContract'
import { pick } from '../render/l2rStore'
import { writeTakePick } from '../shoot/takePick'
import { setStageMemo } from './stageMemory'
import { returnTo } from './useSavedCamera'

export function switchTake(engine: OperatorEngine, take: Pick<TakeRecord, 'id' | 'samples' | 'worldId'>): boolean {
  if (engine.deck.recording) return false
  // remembered for the take's world even while Render's store is not scoped to it (a reload comes back on this take)
  writeTakePick(take.worldId, take.id)
  pick(take.id)
  const start = take.samples?.[0]
  if (start) returnTo(engine, start)
  setStageMemo({ cue: 'take' })
  return true
}
