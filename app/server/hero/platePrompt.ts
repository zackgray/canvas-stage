/**
 * The plate's prompt (draw-from-master plan section 2.1 step B): the place with nobody in it, for the app's own Qwen depth draw
 * on the empty depth. The brief's place, light and atmosphere and the pieces in view with their materials, and no person, no
 * clothes and no action. It is the master's wording (kitStillPrompt.ts `mode: 'master'`: the place whole, "the place stands empty
 * and quiet", the pieces, the cut-at-the-top line, the light and the atmosphere said with no one in the picture), with the angle
 * sentence as its camera, so it cannot reach the still's person clauses (the card, the action, the figure lines, the alone line).
 * An owner's pasted prompt is not used here: the plate is the empty set. Pure.
 */
import { buildDrawPrompt, type StillPromptParts } from './kitStillPrompt.ts'

export function buildPlatePrompt(p: StillPromptParts): string {
  return buildDrawPrompt({ ...p, mode: 'master', override: undefined, figures: null, action: undefined, takeAction: undefined, masterCamera: p.view?.angle ?? '' })
}
