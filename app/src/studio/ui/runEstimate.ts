// Time estimates shown on a running paid draw. Measured, not guessed: the render numbers come from the ledger
// (experiments/credit-log.md: 97 frames took 118 s, 145 frames took 219 s); the others are the figures the guide already quotes.

export const MASTER_ESTIMATE = 'about 2 minutes'
export const MASTER_BOTH_ESTIMATE = 'about 2 minutes for both'
export const STILL_ESTIMATE = 'about 2 to 3 minutes'
export const PIECE_ESTIMATE = 'about a minute'

/** the two measured renders: [frames, seconds] */
const LEDGER = [[97, 118], [145, 219]] as const

/** A render's estimate from its frame count: the ledger's two runs, and the same per-frame rate beyond them. */
export function renderEstimate(frames: number | null | undefined): string {
  if (typeof frames !== 'number' || !Number.isFinite(frames) || frames <= 0) return 'a few minutes'
  const [[f0, s0], [f1, s1]] = LEDGER
  if (frames <= f0) return 'about 2 minutes'
  if (frames <= f1) return 'about 3 to 4 minutes'
  const secs = s1 + (frames - f1) * ((s1 - s0) / (f1 - f0))
  return `about ${Math.round(secs / 60)} minutes`
}
