/**
 * The still judge and its two paid redraws (recipe wave; docs/troubleshooting-control-review-fable.md items 2 and 3, recipe steps 4
 * and 6). Pure: the browser imports the shapes and the prices. The judge is free and local; a redraw is ONE Klein 4B crop/stitch job
 * (E135 graph) that lands as a pass candidate (src/shared/passContract.ts), never straight onto the still.
 */
import type { PassBox } from '../../src/shared/passContract.ts'
import type { LayoutCheck } from './kitSpec.ts'

/** Measured single-crop Klein redraws: a face from its card billed 3 (E141 cface), a prop from its board tile 2 (E138 loco s4, E139
 *  loco m2-b); a two-face chain 4 (E141). Priced at or above every one of them. */
export const FACE_REDRAW_CR = 3
export const PROP_REDRAW_CR = 3
export const redrawCredits = (pass: RedrawPass): number => (pass === 'face' ? FACE_REDRAW_CR : PROP_REDRAW_CR)

export type RedrawPass = 'face' | 'prop'

/**
 * How a staged person sits in the still:
 *  ok        their outline in the still follows the clay's figure there
 *  off       the clay has them here but the still's edges do not follow their outline: missing, moved or grown (flagged)
 *  offscreen the clay does not show them at this frame (nothing to judge)
 *  unknown   the clay has no figure map at this frame, or their colour on it is shared, so no box (flagged: nobody checked)
 */
export type PersonStatus = 'ok' | 'off' | 'offscreen' | 'unknown'

export interface StagedPerson {
  /** the ID-pass entity: 'hero' or 'extra:<index>:<variant>' */
  entity: string
  /** what the strip calls them: the card's name, else "The performer" / "Extra 2" */
  name: string
  /** the cast card playing them (the hero: the performance's castId; an extra: its Bible tag's cast card); null = none */
  cardId: string | null
  /** the card's face image, a public URL; null = no card or no face on disk */
  cardUrl: string | null
  /** the 100 % crop around them in the still's pixels (their clay box, padded); null = no box */
  box: PassBox | null
  /** where a face redraw would work: the head's face area in still pixels; null = no box or the head is cut off */
  face: PassBox | null
  status: PersonStatus
  /** how well the still's edges follow their clay outline, 0..1 (null = not measured) */
  match: number | null
}

/** a set piece in view that has a board tile to redraw it from */
export interface StillPiece {
  /** the Bible tag of its board tile (its pieceTag 'prop:<tag>' without the prefix) */
  tag: string
  line: string
  tileUrl: string
  /** its 100 % crop in still pixels */
  box: PassBox
}

/** a face the free count found, in still pixels */
export interface FaceBox { x: number; y: number; w: number; h: number; score: number }

/** GET /__lab/hero/judge?take=&still= (free, local; kit takes) */
export interface StillJudge {
  stillId: string
  frame: number
  /** false = not a kit take: no clay to judge the people against (the strip says so; Approve is one click as before) */
  kit: boolean
  width: number
  height: number
  layout: LayoutCheck | null
  people: StagedPerson[]
  pieces: StillPiece[]
  /**
   * the free face count (faceCount.ts): faces seen vs the staged people in frame; more seen than expected flags the still (a doubled
   * figure), fewer never does. null = it could not be counted (no Python or model, or no clay): never an error.
   */
  faces?: { seen: number; expected: number; boxes: FaceBox[] } | null
  /** any person off or unknown, more faces than people, or the layout check failed: Approve is a deliberate second click */
  flagged: boolean
  prices: { face: number; prop: number }
}

/** POST /__lab/hero/redraw (paid, one Klein job; answers when the candidate is ready, the candidate is listed from the start) */
export interface RedrawRequest { takeId: string; stillId: string; pass: RedrawPass; /** face: the person's entity; prop: the piece's tag */ subject: string }

/**
 * Below this a staged person's outline match (outlineMatch.ts) is "off". Calibrated 2026-10-24 on the E140/E141 railway takes'
 * frame-0 ID pass against 9 real stills: the 17 people drawn on their mark scored 0.34-0.63; the traveller missing from E138's still
 * 0.12; the same masks moved one figure-width sideways 0.20-0.41 (the high ones landing on the other person). A coarse flag that
 * sends the owner to the 100 % crop, never a refusal; recalibrate once more stills with people exist.
 */
export const PERSON_MIN_MATCH = 0.33

/** the job label prefix of a still redraw (its own section: not a hero-still job, so the hero list never calls it unrecovered) */
export const REDRAW_KEY = 'still-redraw'
export const REDRAW_LABEL = 'still-redraw '
export const isRedrawLabel = (label: string): boolean => label.startsWith(REDRAW_LABEL)
export const redrawLabel = (takeId: string, candidateId: string): string => `${REDRAW_LABEL}${takeId} ${candidateId}`
