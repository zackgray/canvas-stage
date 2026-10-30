/**
 * The face detail pass routes (recipe step 6, E143 arm s): what server/l2r/faceRoutes.ts answers and the Render step's FacePassRow
 * reads. Types and route names only; the result itself is a server/passes candidate (src/shared/passContract.ts, pass 'facePass').
 *   GET  /__lab/l2r/face?render=l2r-…            -> FacePassStatus (free)
 *   POST /__lab/l2r/face/track {renderId, subject} -> { person: FacePersonView } (free, local Python: the head track and the strip)
 *   POST /__lab/l2r/face {renderId, subject}       -> { candidate } once the candidate exists; the paid job and the paste run on
 *        (409 busy / not_finished / not_fixable / no_track, 400 bad_request, 404 not_found, 429 budget, 503 no_target)
 */
export const FACE_ROUTE = '/__lab/l2r/face'
export const FACE_TRACK_ROUTE = `${FACE_ROUTE}/track`

/** the free track of one person on the render on show */
export interface FaceTrackView {
  ok: boolean
  /** plain words when the face could not be followed */
  why?: string
  /** the face at a few frames side by side (PNG), and which frames */
  strip?: string
  frames?: number[]
  /** YuNet found the face on this many of the render's frames */
  hits?: number
}

/** one staged person of the render */
export interface FacePersonView {
  /** 'hero', or the extra's ID-pass tag 'extra:<index>:<variant>' */
  subject: string
  /** their cast card's name, else the Bible tag */
  name: string
  /** their head's height at its largest in the clay's ID pass, px at 1920 wide (null = not measured) */
  headPx: number | null
  /** the face is small enough that the render leaves it soft: the pass is offered */
  small: boolean
  /** null = it can be fixed now; else plain words why not (no card face, no ID pass, too small to rescue, …) */
  why: string | null
  track: FaceTrackView | null
}

export interface FacePassStatus {
  renderId: string
  people: FacePersonView[]
  /** credits per face, rounded up (on the button) */
  price: number
  running: { since: string; what: string; jobId?: string } | null
  configured: boolean
}
