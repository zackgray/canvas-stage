// The Describe-a-move panel's user-facing copy (plan section 5, verbatim where the plan gives wording). The one term for the
// box in the UI is "motion computer" — these strings are the only words the panel renders about it, so the forbidden-words
// rule (never Kimodo / constraint / seed / candidate / BVH / Bible) holds by construction here.
export const OFF_LINE = "Making new moves needs the motion computer, which isn't set up (see Setup). Ready-made moves still work:"
export const OFFLINE_LINE = "The motion computer isn't reachable right now, so new moves can't be made. Ready-made moves still work:"
export const WARMING_LINE = 'The motion computer is starting up (about a minute).'
export const BUSY_LINE = 'The motion computer is making another move; yours starts when it finishes.'
export const LOST_LINE = 'Lost contact with the motion computer. It may still finish.'
export const FAILED_LINE = 'The motion computer could not make this move well enough. Try simpler words, or use a ready-made move.'
export const CANCELLED_LINE = 'Cancelled.'
export const KEEP_FAIL_LINE = 'The download failed. Try again.'
/** tries the box makes a round; a make takes about this many tries' time plus a few seconds to start and finish */
export const TRIES_PER_MAKE = 8
/** how long a make takes, in words, from the box's own seconds per try (a minute when it has not said) */
export const makeEstimate = (secondsPerTry: number | null, tries = TRIES_PER_MAKE): string => {
  if (!secondsPerTry) return 'about a minute'
  const s = Math.round((secondsPerTry * tries + 5) / 5) * 5
  return s < 90 ? `about ${s} s` : `about ${Math.round(s / 60)} minutes`
}
export const freeLine = (secondsPerTry: number | null): string => `Free. Made on your motion computer; ${makeEstimate(secondsPerTry)}.`
export const MAKING_LINE = 'Making the move on your motion computer'
export const MORE_FAILED_LINE = "The motion computer couldn't start another round. Try again in a moment."
/** the result line: the best move first, then each other one Try another brings up */
export const resultLine = (shown: number): string => (shown === 0 ? 'Her move is ready.' : 'Here is another way she can do it.')
export const PLACEHOLDER = 'e.g. slides a tray out of the oven and holds it up'

/** the box's dropped reason as a bare clause: it already says "16 of 16 dropped because ..." itself (QA run 5 doubled it) */
export const droppedClause = (reason: string): string =>
  reason.trim().replace(/^\d+\s+of\s+\d+\s+dropped\s+because\s+/i, '').replace(/[.\s]+$/, '')

/** every try was dropped: what went wrong once, and what to change, in plain words */
export const allDroppedLine = (reason: string): string => {
  const why = droppedClause(reason)
  return `The motion computer could not make this move well enough${why ? `: ${why}` : ''}. Move her closer to the piece, pick another piece, or use simpler words. Ready-made moves still work:`
}
/** after a reload the panel no longer has the words a job was made from: more tries need them written again */
export const NO_SPEC_LINE = 'To make another, press Discard and write the move again.'
