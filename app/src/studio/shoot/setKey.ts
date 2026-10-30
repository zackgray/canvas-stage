// The set key (carryContract.ts TakeRecord.setKey): a hash of the kit set plan alone, recorded at lock. A piece built or moved
// rewrites the plan (server/stage3d/store.ts changeKit) but leaves the camera and the performance, so the startKey and the pack id
// cannot see it; this is what lets Shoot say "changed since lock" for the set. The frame-0 key also hashes the plan, but mixed with
// the figures and the cast, so it cannot name the set as the cause.

const fnv = (text: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

/** the key of a kit set plan, or null with no kit set (a panorama world, a pack's lifted performance) */
export function setKeyOf(plan: unknown): string | null {
  if (plan === null || plan === undefined) return null
  try { return fnv(JSON.stringify(plan)) } catch { return null }
}

/** the locked take's set is not the one on the stage now (both known): its frames, stills and render show the old set */
export const setMovedSinceLock = (locked: { setKey?: string } | null, now: string | null): boolean =>
  !!locked?.setKey && !!now && locked.setKey !== now

