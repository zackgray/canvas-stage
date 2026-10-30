// What Play is waiting for while a picked take's own walk or set is not on the stage yet (takePerformer.ts waits for the same two
// things on the press): the words for the greyed Play, or null when everything the take needs is there. Reads only.
import type { Stage } from '../../labs/projection/engine/Stage'
import { takeOnShow, takeOnShowFor } from '../../labs/projection/stage3d/takeOnShow'
import { stageSetKey } from '../shoot/takeSetShow'
import { onShowPack, stagePackId } from '../shoot/takeShow'

export const LOADING_WALK = 'Loading the take\'s walk…'
export const LOADING_SET = 'Loading the take\'s set…'

export function takeLoadingWords(stage: Stage | null, worldId: string | null): string | null {
  if (!stage) return null // no stage to wait on: the press says so itself
  const want = onShowPack(worldId)
  if (want && stagePackId(stage) !== want) return LOADING_WALK
  const s = takeOnShowFor(takeOnShow(), worldId)
  if (s?.plan && s.setKey && stageSetKey(stage) !== s.setKey) return LOADING_SET
  return null
}
