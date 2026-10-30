/**
 * Recipe wave, Track B: what the Render press and the free finish take beyond shotContract (which is at its size limit).
 * Pure types, shared by server/l2r and the Render screen. Never raw guide strengths: the preset names are the interface,
 * the numbers live in a tooltip (HOLD_TIPS).
 */

/** "Hold the clay": a wide keeps the clay as the layout on stage 1 only (the drawn set survives stage 2); a close-up guides both stages (the people stay on the clay's marks) */
export type HoldPreset = 'wide' | 'closeup'
export const HOLD_PRESETS: readonly HoldPreset[] = ['wide', 'closeup']
export const HOLD_DEFAULT: HoldPreset = 'wide'
/** from this focal length a take is a close-up and the picker opens on it (the owner can still change it) */
export const CLOSEUP_FROM_MM = 85
export const HOLD_LABELS: Record<HoldPreset, string> = { wide: 'Hold the clay: wide', closeup: 'Hold the clay: close-up' }
export const HOLD_TIPS: Record<HoldPreset, string> = {
  wide: 'The clay guides the first pass only (guide 1.0); the second, sharper pass runs without it, so the set you drew is not pulled back onto the clay. Best for wides.',
  closeup: 'The clay guides both passes (guide 1.0 on each), so a face stays on the clay\'s mark. Best for close-ups; on a wide it can re-fit the set to the clay.',
}

/** POST /__lab/l2r also takes (the press) the hold preset */
export interface L2RHoldExtra { hold?: HoldPreset }

/** POST /__lab/l2r/finish {renderId, grade?}: absent = follow what the render recorded. grade false/null = off, true/{strength?} = on.
 *  (A `dof` field an older client sent is ignored: the finish has no depth of field.) */
export interface FinishRequest {
  renderId: string
  grade?: boolean | null | { strength?: number }
}

/** what a render records of its choices (all optional: an older render has none and finishes as it did) */
export interface L2RRenderChoices {
  hold?: HoldPreset
  /** (retired) the depth-of-field mode an older render's last finish recorded; read by nothing, kept so old records load */
  dofMode?: 'off' | 'still' | 'frames'
  /** the grade is switched off at the finish though the render recorded one (turning it on again keeps the record) */
  gradeOff?: boolean
  /** when the last finish landed: the player keys its video on it (the file name does not change) */
  finishedAt?: string
}

// interface merging, as lensContract does for the DoF summary: every L2RRender may carry these (shotContract.ts is at its size limit)
declare module './shotContract.ts' {
  interface L2RRender extends L2RRenderChoices {}
}
