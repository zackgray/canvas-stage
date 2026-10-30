/**
 * Layout-To-Render price. Cloud's cost grows faster than linearly with frames. Seed curve, re-based 2026-10-25 from the app's own
 * billed renders (server/priceBasis.ts has the table): 41 f 16, 49 f 17-18 (n=5), 57 f 19, 97 f 20-27, 145 f 21-28 (n=5, 2026-10-28), 193 f 36-57. Each anchor sits
 * at or just above the dearest take billed at that length. Rounded up on purpose: an under-read price is the failure that costs
 * the owner trust, an over-read costs nothing.
 */
export const L2R_ANCHORS: readonly (readonly [number, number])[] = [[0, 4], [41, 17], [49, 18], [57, 20], [97, 28], [145, 31], [193, 58]]
/** a keyframed take billed 0-1 cr over the same length unkeyed (49 f: 17-18 either way; the old +5-7 is gone) */
export const L2R_KEYFRAME_SURCHARGE = 1
/** the learned correction from this app's own renders may raise the price, never lower it under the re-based anchors (each sits
 *  at the dearest bill, so a cheaper-than-anchor history pulling it down is what showed 17 against an 18 bill) */
export const L2R_SCALE_MIN = 1
export const L2R_SCALE_MAX = 1.5

/** the seed curve at `frames`: linear between anchors, the last segment's slope beyond the end */
export function seedCredits(frames: number): number {
  const a = L2R_ANCHORS
  let i = 1
  while (i < a.length - 1 && frames > a[i][0]) i++
  const [x0, y0] = a[i - 1]
  const [x1, y1] = a[i]
  return y0 + ((frames - x0) * (y1 - y0)) / (x1 - x0)
}

export interface L2RDone { frames: number; credits: number; keyed?: boolean }

/** credits for `frames`, always rounded up: the seed curve scaled by how this app's own paid renders compare to it */
export function l2rEstimate(frames: number, done: L2RDone[] = [], keyed = false) {
  const own = (d: { frames: number; keyed?: boolean }) => seedCredits(d.frames) + (d.keyed ? L2R_KEYFRAME_SURCHARGE : 0)
  const paid = done.filter((d) => d.credits > 0 && d.frames > 0)
  const ratio = paid.length ? paid.reduce((s, d) => s + d.credits / own(d), 0) / paid.length : 1
  const scale = Math.min(L2R_SCALE_MAX, Math.max(L2R_SCALE_MIN, ratio))
  const credits = Math.max(1, Math.ceil((seedCredits(frames) + (keyed ? L2R_KEYFRAME_SURCHARGE : 0)) * scale - 1e-9))
  const basis = paid.length
    ? `from your ${paid.length} past render${paid.length > 1 ? 's' : ''}, rounded up`
    : `${frames} frames, rounded up (+${L2R_KEYFRAME_SURCHARGE} cr with keyframes)`
  return { credits, perFrame: Math.round((credits / frames) * 1000) / 1000, frames, basis }
}
