/**
 * Pass candidates (recipe wave, 2026-10-24; docs/troubleshooting-control-review-fable.md item 3). Every paid pass that edits an
 * approved image or a finished render (prop crop redraw, per-face redraw, face detail pass) lands as a CANDIDATE, shown before
 * beside after at 100 %. Keep makes it the approved image (the earlier one stays on disk as history); Discard is free and changes
 * nothing. Types only; the store and routes are server/passes/. Fields are only ever added, never renamed.
 */

/** which pass made it: 'prop' = a set piece's crop redrawn from its board tile, 'face' = a person's face redrawn from their card on
 *  a still, 'facePass' = the E143 head-tracked face detail pass on a rendered take */
export type PassKind = 'prop' | 'face' | 'facePass'

/** what the pass edits: a hero still (by still id) or a finished L2R render (by render id) */
export type PassTarget = { kind: 'still'; stillId: string } | { kind: 'render'; renderId: string }

/** the crop the pass worked in, in the target's pixels (stills) or the first frame's pixels (renders) */
export type PassBox = { x: number; y: number; w: number; h: number }

export type PassState = 'running' | 'candidate' | 'kept' | 'discarded' | 'failed'

export interface PassCandidate {
  id: string
  takeId: string
  pass: PassKind
  target: PassTarget
  /** what was redrawn: a board element tag (prop), a cast card id or Bible tag (face, facePass) */
  subject: string
  box: PassBox
  state: PassState
  /** the target as it was when the pass started, and the pass's result (a PNG for stills, an MP4 for renders); URLs under /lab-assets */
  beforeUrl: string
  afterUrl: string | null
  /** 100 % crops of `box` from before and after, for the side-by-side (PNG; renders: frame 0 and the frame the face is largest) */
  beforeCropUrl: string | null
  afterCropUrl: string | null
  jobId: string | null
  costCredits: number | null
  error?: string
  createdAt: string
  /** set when kept: the URL that was replaced, so the history is on disk */
  replacedUrl?: string
}

/** GET /__lab/passes?take=<id> */
export interface PassListResponse { candidates: PassCandidate[] }
/** POST /__lab/passes/keep and /__lab/passes/discard, body { id } */
export interface PassDecisionRequest { id: string }
