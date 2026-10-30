// Starting a scene from Home: a new library scene whose design already holds the Guided state and, when Home's box had words,
// those words as the box's text (Develop reads them there). "Use my words as they are" also makes them the scene words and the
// story, as typed by hand. The local copy is marked unsynced, so the Stage's first read of the (empty) server draft keeps it.
// (first-words-focus-and-names) `isUntouched` names the scenes Home treats as no-work-yet: still the default name, nothing on the
// board, no set, no takes. They stay off the Resume list and Start reuses the newest one instead of piling up empty scenes.
import { DEFAULT_SCENE_NAME, type SceneSummary, type SceneView } from '../../shared/libraryContract'
import { openRoute } from '../scene/design/routes'
import { freshDesign, markUnsynced, saveDesign, type Design } from '../scene/design/state'

/** Home's box: the words, and whether they are the scene words as they are (else Develop composes them) */
export interface SeedIdea { text: string; asIs?: boolean }

export function seededDesign(idea?: SeedIdea): Design {
  const d = freshDesign()
  const base: Design = { ...d, ...openRoute(d) }
  const text = idea?.text ?? ''
  if (!text.trim() || !base.guided) return base
  const g = base.guided
  if (!idea?.asIs) return { ...base, guided: { ...g, idea: { text } } }
  const words = text.trim()
  return { ...base, brief: words, edited: true, guided: { ...g, idea: { text }, st: { ...g.st, story: { ...g.st.story, text: words } } } }
}

export function seedScene(scene: SceneView, idea?: SeedIdea): void {
  saveDesign(seededDesign(idea), scene.id)
  if (idea?.text.trim()) markUnsynced(scene.id)
}

/** no work yet: the default name, nothing on the board, no set, no takes — hidden from Resume and reused by Start */
export function isUntouched(s: Pick<SceneSummary, 'name' | 'stage' | 'thumbnail'>): boolean {
  return s.name === DEFAULT_SCENE_NAME && s.stage === 'brief' && !s.thumbnail
}
