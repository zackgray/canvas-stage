/**
 * The clay-depth shape, and the retired depth-of-field records that older takes and renders still carry (split out of shotContract.ts,
 * at its size limit; that file merges them into its interfaces and re-exports everything here: import from shotContract.ts).
 * There is no depth of field any more: TakeLens and L2RRenderDof stay only so older files load; nothing reads them. Pure (no DOM, no node).
 */

/** (retired) the lens an older take recorded at lock, from the live view's Lens panel. Read by nothing. */
export interface TakeLens {
  /** the live depth of field was on: off = the operator saw everything sharp, so the finish adds none */
  dof: boolean
  /** f-number, e.g. 2 for f/2 */
  fNumber: number
  /** sensor format (a sensor format id) */
  format: 'ff' | 'lf' | 's35'
  /** that format's width in mm (the view's framing is kept: the lens is focal x sensorMm / 36) */
  sensorMm: number
}

/** metres per unit of a zdepth PNG: 1 cm, so 16 bits reach 655.34 m. 0 = nothing drawn; 65535 = at or past 655.34 m (both: infinity). */
export const CLAY_DEPTH_UNIT_M = 0.01

/** A kit clay's metric depth (the hero still's depth control), one zdepth_NNN.png per frame beside the clay (kept after the encode). Planar metres (camera z), not radial. */
export interface ClayDepth {
  kind: 'planar'
  unitM: number
  frames: number
  width: 1920
  height: 1088
  /** file name pattern in the clay folder */
  pattern: 'zdepth_%03d.png'
}

/** (retired) the depth of field the free finish of an older render applied (absent / null = none). Read by nothing. */
export interface L2RRenderDof {
  fNumber: number
  format: TakeLens['format']
  /** focus at the first and last frame, metres */
  focusFirstM: number
  focusLastM: number
  /** the largest CoC radius at infinity over the frames, px at 1920 wide (capped at the live view's 24) */
  infinityRadiusPx: number
}
