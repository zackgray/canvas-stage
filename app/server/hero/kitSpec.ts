/**
 * The kit still's constants (track B, docs/preproduction-plan-fable.md §3.3): a depth-locked Qwen-Image 2512 draw (E130
 * recipe: Fun ControlNet Union on the depth) at 1664x944, Lanczos up to 1920x1088 in the graph, a free colour-match, then a Klein 4B finish with N references at
 * 0.5 MP (E118 card step). Keyframes are always this depth-locked redraw, never an edit of the master (Wave 0 P3). Pure: the
 * browser imports it for the price and the roles.
 */
import { isMidFrame, KEYFRAME_ROLES, midFrame, type HeroStill, type KeyframeRole } from '../../src/shared/shotContract.ts'
import { QWEN_DEPTH_CR } from '../../src/shared/bibleContract.ts'
import type { DrawMode } from '../../src/shared/stillPressContract.ts'
import { DEFAULT_LOCK, LOCK_PRESETS, type LockPresetId } from './lockPresets.ts'
import type { DrawAdds } from './drawAdds.ts'

export const QWEN_W = 1664
export const QWEN_H = 944
export const QWEN_STEPS = 50
/** the Fun ControlNet Union's depth strength a still draws at with no preset: the recipe's photographic lock (E139 M2, lockPresets.ts) */
export const DEFAULT_DEPTH_STRENGTH = LOCK_PRESETS[DEFAULT_LOCK].strength
/** seeds a still press draws by default (owner 2026-10-25: the owner picks 1 or 2 per press to control spend; 1 unless asked) */
export const DEFAULT_STILL_SEEDS = 1
/** every Klein reference beyond the drawn still goes in at 0.5 MP (E118, E126 card step) */
export const KLEIN_REF_MP = 0.5
/** at most this many material references (Wave 0 P4: Klein copies a close material reference cheaply) */
export const MAX_MATERIAL_REFS = 2

/** A kit still's draw is depth-locked (Fun ControlNet), which bills more than a plain 2512 image (14): 16-17 cr, and the Klein finish ~2-3 on top.
 *  The stranger-QA re-run billed 18, 19 and 19 for three stills shown at 17, so the pair shows 21 (QWEN_DEPTH_CR 18 + 3): at or above what any still billed. */
export const QWEN_CREDITS_PER_STILL = QWEN_DEPTH_CR
export const KLEIN_CREDITS_PER_STILL = 3
export const kitStillCredits = (count: number): number => (QWEN_CREDITS_PER_STILL + KLEIN_CREDITS_PER_STILL) * Math.max(1, count)
/** "Finish": the Klein step alone for draws whose finish never ran (kitFinish.ts) */
export const kitFinishCredits = (count: number): number => KLEIN_CREDITS_PER_STILL * Math.max(1, count)

/** what a still flagged by the layout check says, in plain words: the check cannot tell a lost hero from a moved structure, so it says both */
export const LAYOUT_WARNING = 'This still may be missing the hero or have moved part of the set — compare with the set frame before approving.'

/** below this, the still is flagged "doesn't match the set" (layoutCheck.ts; calibrated on E115/E118/E123/E126 stills) */
export const LAYOUT_MIN_SCORE = 0.38

export const isRole = (v: unknown): v is KeyframeRole => typeof v === 'string' && (KEYFRAME_ROLES as readonly string[]).includes(v)

/** The clay frame a role guides: the opening is 0, the end the last frame, the mid a picked frame on the 8-grid (isMidFrame) or the
 *  middle snapped to it (midFrame), so Render can always send it. */
export function frameFor(role: KeyframeRole, frames: number, pick?: number): number {
  if (role === 'opening') return 0
  if (role === 'end') return frames - 1
  return pick !== undefined && isMidFrame(pick, frames) ? pick : midFrame(frames)
}

/** The layout check written on a kit still: how well its edges sit on the clay's depth edges (0..1). */
export interface LayoutCheck { score: number; ok: boolean; message: string | null }
/** The colour-match step on a kit still: what it was matched to, or why it was skipped (never a reason to fail a paid still). */
export interface StillGrade { target: string | null; method: 'reinhard-lab'; skipped?: string }

/** What a kit still records beyond HeroStill (all optional: a pano still or an older one still reads). */
export interface KitStill extends HeroStill {
  madeBy?: string
  depthStrength?: number
  /** (recipe wave) the lock preset it was drawn with (null = a raw strength) and the share of steps the depth held for */
  lockPreset?: LockPresetId | null
  depthEnd?: number
  /** (recipe wave, join) which clay's depth drove the control: the massing clay when current, else the precise (absent = precise) */
  controlDepth?: 'massing' | 'precise'
  /** (recipe wave) the Bible tags sent to the finish as material references (board props and materials) */
  materials?: string[]
  layout?: LayoutCheck | null
  grade?: StillGrade | null
  /** the Klein references sent beyond the drawn still, in image order (face, gear, master, materials) */
  refs?: string[]
  prompt?: string
}

/** POST /__lab/hero also takes (kit takes): which keyframe, its frame, Bible material tags to send as references (absent = the
 *  default refs, [] = none), the lock preset (or, for old callers, a raw strength held to the end). */
export interface KitRenderFields { role?: KeyframeRole; frame?: number; materials?: string[]; depthStrength?: number; preset?: LockPresetId
  /** (draw-from-master) 'edit' = drawn from the scene's approved look frame (kitRunEdit.ts); absent = 'depth', today's press */
  mode?: DrawMode
  /** (stage-only) true = the finish takes the clothes from the scene's approved look frame (sameLook.ts) instead of the card's own
   *  picture; absent = false. A request only: nothing stores it but the still's own `refs` */
  sameLook?: boolean
  /** (owner 10-29) the finish's words as the owner edited them in "What will be sent", sent as written; absent = the composed card */
  finishPrompt?: string
  /** (prompt-fix pass) the draw words the app adds, switched off per take ("Added by the app", drawAdds.ts); absent = all on */
  drawAdds?: DrawAdds }

/** A kit still whose Qwen draw landed and whose Klein finish never ran (a budget refusal between them, a restart). */
export interface UnfinishedStill { id: string; role: KeyframeRole; frame: number; /** the draw's public path */ png: string; createdAt: string; startKey: string }
/** GET /__lab/hero also answers (kit takes): draws waiting for "Finish" (POST /__lab/hero/finish {takeId, ids?}, priced kitFinishCredits) */
export interface KitListExtra { unfinished?: UnfinishedStill[] }
