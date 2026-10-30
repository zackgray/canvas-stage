// A scene's name from its first words (the first-run flow's one survivor: the first-words card is gone, a new scene lands on the
// Stage with the Prompt box open and focused, PromptDrawer.tsx). Pure and small, so it is unit-tested.
import { SCENE_NAME_MAX } from '../../shared/libraryContract'

/**
 * A scene's name from its first words (first-words-focus-and-names): the first words of the first sentence, cut to the name's
 * length at a word edge, so a scene never sits in the Resume list as one of many "Untitled scene" rows. Null when there is
 * nothing to name it from yet.
 */
export function nameFromWords(brief: string): string | null {
  const first = (brief.trim().split(/(?<=[.!?])\s/, 1)[0]?.trim() ?? '').replace(/[.!?]+$/, '').trim()
  if (!first) return null
  const words = first.replace(/\s+/g, ' ')
  if (words.length <= SCENE_NAME_MAX) return words
  const cut = words.slice(0, SCENE_NAME_MAX + 1)
  const edge = cut.lastIndexOf(' ')
  const name = (edge > 0 ? cut.slice(0, edge) : cut).trim()
  return name || null
}
