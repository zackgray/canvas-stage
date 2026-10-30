// The Guided route's stages, in the order a film is made: words for the place and its light, then the pieces drawn alone (the cast
// cards, the prop tiles), then the story's words. Location, Light & mood and Story beats draw nothing: their words go into the brief
// the planner and every later prompt read. Pure; guided.ts holds the state they fill.
import type { GuidedStageId } from '../briefApi'

/** the stages whose only content is the user's words (Materials is no stage any more: its old text folds into the lines) */
export type WordStageId = Exclude<GuidedStageId, 'cast' | 'mats'>
export type GuidedStep = WordStageId | 'cast' | 'props'
export interface StageDef {
  id: GuidedStep; name: string; q: string; ph: string; what: string
  /** words: a description only; cast and props: one card per piece, each drawn alone */
  kind: 'words' | 'cast' | 'props'
  optional: boolean
}
export const STAGES: StageDef[] = [
  { id: 'loc', name: 'Location', q: 'Describe your location', ph: 'A narrow track through an old forest, low evening light.', what: 'the location', kind: 'words', optional: false },
  { id: 'mood', name: 'Light & mood', q: 'What is the light and the mood?', ph: 'Cold dusk, one warm rim of light.', what: 'the light and mood', kind: 'words', optional: false },
  { id: 'cast', name: 'Cast', q: "Who's in the scene?", ph: '', what: 'the cast', kind: 'cast', optional: false },
  { id: 'props', name: 'Props', q: 'Any props that matter?', ph: '', what: 'the props', kind: 'props', optional: true },
  { id: 'story', name: 'Story beats', q: 'What happens, beat by beat?', ph: 'The runner sprints, the others close in, the fog swallows the runner.', what: 'the story beats', kind: 'words', optional: true },
]
export const stageIndex = (id: GuidedStep) => STAGES.findIndex((d) => d.id === id)

/** how many options one Generate press draws on the Cast and Props steps: the owner picks, 2 unless changed */
export const GEN_N = 2
export const GEN_MIN = 1
export const GEN_MAX = 4
/** the Cast step draws as few as one look (server/cast/prompts.ts MIN_CANDIDATES) */
export const GEN_MIN_CAST = 1
