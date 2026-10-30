/**
 * Wave 0.5 (docs/preproduction-plan-fable.md §4): the shapes the Bible tracks add to a take's stills, clay and render. Split out
 * of shotContract.ts (at its size limit), which merges them into its interfaces and re-exports everything here: import from
 * shotContract.ts. Fields are only ever added. Pure (no DOM, no node).
 */

/** Where a still guides Layout-To-Render: the opening frame (0), a mid keyframe, the end keyframe (the take's last frame). */
export const KEYFRAME_ROLES = ['opening', 'mid', 'end'] as const
export type KeyframeRole = (typeof KEYFRAME_ROLES)[number]

/** LTX latents are 8 pixel frames: a guide frame index snaps to the 8-grid (experiments/tune/keyframes.ts). */
export const snapFrame = (n: number): number => Math.floor((n + 3) / 8) * 8
/** The mid keyframe's clay frame: the middle snapped to the 8-grid, kept in [8, last] (Render refuses any other). */
export const midFrame = (frames: number): number => Math.max(8, Math.min(frames - 1, snapFrame(Math.floor(frames / 2))))
/** May a mid keyframe be drawn on this picked frame? On the 8-grid, from 8 to before the last frame. */
export const isMidFrame = (frame: number, frames: number): boolean => Number.isInteger(frame) && frame >= 8 && frame < frames - 1 && frame === snapFrame(frame)
/** The clay frames that carry a keyframe (and an ID pass): the first, the mid, the last; each once. */
export const keyframeIndices = (frames: number): number[] => [...new Set([0, midFrame(frames), frames - 1].filter((i) => i >= 0 && i < frames))]

/** Track E2: the flat-colour ID pass a kit clay renders at its keyframe indices only (lights, fog and tone mapping off). Never sent to LTX. */
export interface ClayIdPass {
  /** the clay frame indices that have an id_NNN.png beside their zdepth_NNN.png (0, mid, last) */
  frames: number[]
  /** file name pattern in the clay folder */
  pattern: 'id_%03d.png'
  /** entity tag (stage3d EntityTag, e.g. 'hero', 'extra:2:5') -> the flat sRGB colour it was drawn in, 0..255. Unlisted = the world, black. */
  colors: Record<string, [number, number, number]>
}

/** Track C: one guide still Layout-To-Render was given beyond frame 0's, as sent. */
export interface L2RKeyframe {
  stillId: string
  role: KeyframeRole
  /** the clay frame it guides */
  frame: number
  /** the guide strength sent (plan §3.3: guides at 0.7, the first and last at 1.0) */
  strength: number
}

/** plan §3.3: mid keyframes guide at 0.7, the opening still and the end keyframe at 1.0 (m15: here, so the server never imports src/studio) */
export const KEY_STRENGTH = { mid: 0.7, end: 1 } as const
/** Wave 0 P0: grade-to-master works but flattens drama, so it is opt-in and blended in at this strength */
export const GRADE_DEFAULT = 0.7

/** The free colour-match method (track D's script). */
export type GradeMethod = 'reinhard-lab'

/** Track C: the grade to the Bible's master the finish applied before sharpen and grain (absent / null = none). */
export interface L2RGrade {
  /** public path of the image the clip was matched to (the Bible's approved master) */
  target: string
  method: GradeMethod
  /** the Bible version the target came from */
  bibleVersion?: number
}
/** The grade as recorded on a render: L2RGrade plus how strongly it was blended in (1 = the full match). */
export interface GradeRecord extends L2RGrade { strength: number }

/**
 * Track D's script, by the name B and C call it (both spawn it through the LIFT_PYTHON interpreter, as the finish does today):
 *   python scripts/l2r/colormatch.py --target <png> --in <png|mp4> --out <png|mp4>
 * still -> still or clip -> still by the input's extension; a clip keeps its frame count and fps; exit 0 = written, else stderr says why.
 */
export const COLORMATCH = { script: 'scripts/l2r/colormatch.py', method: 'reinhard-lab' } as const satisfies { script: string; method: GradeMethod }
