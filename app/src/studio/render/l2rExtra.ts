/**
 * Track C: what the Render route also answers and takes, beyond shotContract's L2RListResponse / L2RRenderRequest (those are
 * Wave 0.5's; shapes here are only ever added to). Pure types and constants, shared by server/l2r and the Render screen.
 */
import type { HoldPreset } from '../../shared/renderFinishContract.ts'
import type { PromptWarning } from '../../shared/stillPressContract.ts'
import type { HeroStill, KeyframeRole } from '../../shared/shotContract.ts'
// m15: the render constants live in the shared keyframe contract (the server reads them there); re-exported for the screens
export { GRADE_DEFAULT, KEY_STRENGTH, type GradeRecord } from '../../shared/keyframeContract.ts'

export type KeyName = 'mid' | 'end'

/** A mid / end still Shoot approved, and whether Render would send it. A stale one is shown with why and refused before spend. */
export interface KeyframeChoice {
  still: HeroStill
  role: KeyframeRole
  frame: number
  strength: number
  stale: string | null
  /** E140: a sentence when the keyframe's drawn set does not follow the clay at its frame (so it can morph the set), else null / absent */
  setDiffers?: string | null
}

/** One image in the chip strip. `sent` = it is a bind of the graph; the others are the Bible references the stills were drawn from. */
export interface RefChip {
  role: 'layout' | 'opening' | 'mid' | 'end' | 'master' | 'face' | 'gear' | 'creature' | 'extras' | 'prop' | 'material'
  label: string
  url: string
  sent: boolean
  /** the graph node.field it binds to (sent chips only) */
  bind?: string
}

/** GET /__lab/l2r?take= also answers (all optional: an older server answers none of it) */
export interface L2RStatusExtra {
  keyframes?: { mid: KeyframeChoice | null; end: KeyframeChoice | null }
  chips?: RefChip[]
  /** the Bible has an approved master to grade to (and its version) */
  gradeTarget?: { png: string; bibleVersion: number } | null
  /** M3: a warning when the take was locked against an older Bible (the take is geometry: never a refusal) */
  takeBible?: string | null
  /** the price with a mid / end guide sent (the keyframe surcharge); `estimate` is the price with none */
  /** (prompt wave) warn-only checks on the default prompt above */
  promptWarnings?: PromptWarning[]
  estimateKeyed?: { credits: number; perFrame: number; frames: number; basis: string } | null
}

/** POST /__lab/l2r also takes */
export interface L2RRenderExtra {
  /** the mid / end still ids to send as guides (each must be the take's approved, fresh keyframe) */
  mid?: string
  end?: string
  /** grade the finish to the Bible's master at this strength (0.1 to 1); absent = no grade */
  grade?: { strength?: number }
  /** recipe wave: "Hold the clay" (absent = both stages, as before) (the first automatic finish's grade rides in `grade`) */
  hold?: HoldPreset
}

/** POST /__lab/l2r/prompt {takeId, text} -> the override with its @tags expanded, as a render would send it (free) */
export interface PromptPreview { text: string; tags: string[]; unknown: string[]; /** (prompt wave) warn-only checks on the override as typed */ warnings?: PromptWarning[] }
