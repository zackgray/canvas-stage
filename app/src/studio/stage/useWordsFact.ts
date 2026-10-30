// Whether "write your words" is done (the Stage's first step). With a take on show the words that count are the TAKE's (what its
// draw and render read, TakeWords.tsx), not the scene's: a scene with words and a take whose own words were cleared still says
// to write them. No take on show, or its row not read yet: the scene's words, as before.
import { useCurrentTakeId } from '../shoot/currentTake'
import { useTakeBoard } from '../shoot/takeBoard'

/** `sceneBrief` null = no scene design read yet (nothing is claimed: the later steps stand) */
export function useWordsFact(sceneBrief: string | null, worldId: string | null): boolean {
  const cur = useCurrentTakeId()
  const { rows } = useTakeBoard(worldId)
  if (sceneBrief === null) return true
  const row = cur ? rows.find((r) => r.id === cur) : undefined
  return !!(row ? row.words : sceneBrief).trim()
}
