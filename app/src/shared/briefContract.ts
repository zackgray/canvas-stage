/**
 * The scene brief, v2 (prompt wave, 2026-10-25; docs/plan-prompt-wave.md §4). The brief is the source of truth every paid prompt is
 * written from: Develop (Gemma) fills it from the user's idea, the user edits any field, and the still / master / render builders read
 * it instead of house-style tables. Stored on the Bible as `brief` beside the flat `prompt / lighting / materials / background` lines,
 * which are derived from it so older readers keep working. Fields are only ever added, never renamed.
 *
 * Provenance: `developed` lists the field paths Gemma filled that the idea did not state ("light.direction", "atmosphere.0",
 * "elements.2.materials"); `user` lists the paths the user edited. A path in neither came from the idea itself.
 *
 * Rules every prompt builder follows:
 * - light is written source → direction (relative to camera and subject) → height → quality → colour → effect; one key only;
 *   "faces in shade with a rim" only when `direction` puts the key behind the subject.
 * - materials and condition come only from the element; `condition` is '' unless the idea implies age, wear or newness.
 * - `style` empty means nothing beyond "photo" / "Photoreal."; a film stock or lens name appears only if `style` names it; the lens
 *   feel comes from the real camera's focal, never a millimetre.
 * - atmosphere is placed in depth (where it is, relative to the subject).
 * - the take's action: the beat whose `who` is the hero, else `take.action`, else the motion segment's word (fallback only).
 */
import type { BriefElement, BriefWarning } from './bibleContract.ts'

export interface BriefLight {
  /** the one key: "low late-afternoon sun", "a single desk lamp" */
  key: string
  /** relative to camera and subject: "behind her, towards camera", "from the left of frame" */
  direction: string
  height: 'low' | 'high' | 'overhead' | ''
  quality: 'hard' | 'soft' | ''
  /** "warm gold", "cold blue" */
  colour: string
  /** fill / practicals beyond the key, '' for none */
  others: string
  /** what it does on the subject: "rims her hair and glows through the comb" */
  effect: string
}

/** particles and air: bees, steam, dust, snow, rain, smoke — placed where they are */
export interface BriefAtmosphere { what: string; where: string }

export interface BriefElementV2 extends BriefElement {
  /** real materials as the idea implies them: "white-painted pine boxes, a tin roof" */
  materials: string
  /** '' unless the idea implies it: "new, factory-fresh", "worn smooth with handling" */
  condition: string
  /** a person's face, for redraws: "deeply lined, kind, grey-white hair" ('' for props) */
  face: string
}

/** one beat of the action, in order; `who` is an @tag, `seconds` its rough length */
export interface BriefBeat { who: string; does: string; seconds: number; visible: string }

/** only as the idea implies; the operator decides the real camera */
export interface BriefCamera { size: string; angle: string; move: string; lensFeel: 'wide' | 'normal' | 'long' | '' }

export interface BriefPlace { setting: string; period: string; season: string; time: string; weather: string }

export interface SceneBriefV2 {
  /**
   * the scene brief paragraph the user reads (the Scene step's "Scene brief", the Bible's scene prompt), with @tags: Develop's full
   * developed brief, every detail of the idea kept word for word plus what Develop added (the name is historical)
   */
  logline: string
  place: BriefPlace
  light: BriefLight
  atmosphere: BriefAtmosphere[]
  elements: BriefElementV2[]
  beats: BriefBeat[]
  camera: BriefCamera
  /** empty by default; the only place a stock, lens name or look word may come from */
  style: string
  background: string
  /** things the idea rules out ("no other people") — never sent as negatives to CFG-1 models */
  exclude: string[]
  warnings: BriefWarning[]
  /** field paths Gemma filled that the idea did not state */
  developed: string[]
  /** field paths the user edited */
  user?: string[]
}
