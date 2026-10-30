/**
 * "Draw from your approved frame" (draw-from-master plan section 2): the constants, the price and the mode field's parser. Pure
 * apart from the 400 it throws. One press is the empty-set plate (a Qwen depth draw, cached per take and start), then ONE
 * Qwen-Image-Edit 2511 job that puts the performer into the plate wearing the look frame's clothes, then the existing Klein finish.
 */
import { isDrawMode, type DrawMode } from '../../src/shared/stillPressContract.ts'
import { KLEIN_CREDITS_PER_STILL } from './kitSpec.ts'
import { HeroHttpError } from './store.ts'

export const EDIT_MADE_BY = 'plate+qwen-edit-2511+union-depth -> klein-4b'
/** the plate (the app's own depth draw on the empty depth): ~17 cr measured, charged once per take and start */
export const PLATE_CREDITS = 17
/** the edit, shown at its cold-start bill (4 cr warm, 8.2 cold: round2-qwen-edit/STATUS.md) */
export const EDIT_CREDITS_PER_SEED = 8
/** the validated edit: latent 1344x768, the Fun ControlNet Union on the full depth at 0.35 from 0 to 40 % (out/edit-B-1mp.graph.json) */
export const EDIT_W = 1344
export const EDIT_H = 768
export const EDIT_DEPTH_STRENGTH = 0.35
export const EDIT_DEPTH_END = 0.4

/** one seed's share of the price: the edit and the finish */
export const EDIT_SEED_CREDITS = EDIT_CREDITS_PER_SEED + KLEIN_CREDITS_PER_STILL
/** the button's price: the plate only when the take has none yet, then every seed's edit and finish (first press of one seed 28, a redraw 11, two seeds fresh 39) */
export const editPressCredits = (count: number, hasPlate: boolean): number => (hasPlate ? 0 : PLATE_CREDITS) + EDIT_SEED_CREDITS * Math.max(1, count)

export const NO_LOOK_FRAME = 'Approve a first frame of another shot of this scene first: this draw takes her clothes and the place from it. Nothing was billed.'

/** the press body's `mode`: absent = 'depth'; anything else unknown is a free 400 */
export function parseDrawMode(v: unknown): DrawMode | undefined {
  if (v === undefined) return undefined
  if (!isDrawMode(v)) throw new HeroHttpError(400, 'mode must be depth or edit (or edit-projected, API only)', 'bad_request')
  return v
}

/** what an edit still records beyond a kit still: where its place and its clothes came from */
export interface EditStillFields { drawMode: 'edit' | 'edit-projected'; /** null = the edit started from the projected master, no plate */ plateId: string | null; lookStillId: string; lookTakeId: string; editSeed: number }
