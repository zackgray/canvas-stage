/**
 * "Edit this frame" (owner 2026-10-28, flagged edit-the-frame): the plain Qwen-Image-Edit 2511 still edit the qa-2026-10-28-qwen-abilities
 * test validated (removal, recolour, one small addition, fog, darker — one change per edit; no Klein, no depth). Pure (the browser
 * imports the route and the price), so nothing here may touch node.
 */
import type { HeroStill } from '../../src/shared/shotContract.ts'
export const FRAME_EDIT_ROUTE = '/__lab/frame-edit'

/** the section key: an edit rides the hero stills' section, one job at a time with the draws (hero/spec.ts HERO_KEY) */
export const FRAME_EDIT_KEY = 'frame-edit'

/** the button's price: the same Qwen edit the draw-from-master press prices at its cold-start bill (hero/editSpec.ts
 *  EDIT_CREDITS_PER_SEED = 8; the abilities test measured 1.6-2 cr warm, 5-7 cold). One edit = one seed = one new version. */
export const FRAME_EDIT_CREDITS = 8

/** one change, typed in plain words: short by design (the wording tips in the test's FINDINGS) */
export const MAX_FRAME_EDIT_PROMPT = 400

export interface FrameEditRequest {
  takeId: string
  /** the version the edit starts from (any still of the take, usually the approved one) */
  stillId: string
  prompt: string
  seed?: number
}

/** the new version: an unapproved still of the take, beside the one it started from (HeroResponse's shape) */
export interface FrameEditResponse { still: HeroStill }
