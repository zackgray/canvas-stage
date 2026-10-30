// The performance on the world clock (pure): which frame of the pack the world shows at time t, which packs belong to
// the current set, and the pack index. File names and URLs are the pack format's (src/project/performance.ts).
//
// Frame i of the pack is world time i/fps (the clip was lifted from world time 0); between frames the nearest wins
// (round), before 0 shows frame 0 and after the end the last frame holds. The clock runs one frame past the last
// frame's time (frames/fps), so the last frame is shown for a frame like every other.

export interface PackTiming { fps: number; frames: number }

/** The pack frame the world shows at time t (-1 for an empty pack). */
export function frameAt(t: number, p: PackTiming): number {
  if (!(p.frames > 0)) return -1
  if (!Number.isFinite(t)) return 0
  return Math.min(p.frames - 1, Math.max(0, Math.round(t * p.fps)))
}

/** World time of pack frame i. */
export const frameTime = (i: number, p: PackTiming) => i / p.fps

/** How long the performance holds the world clock (s). */
export const performanceDuration = (p: PackTiming) => p.frames / p.fps

/** Does a pack lifted against `locationId` belong to the set `source` (ids are prefixed in the merged shot list)? */
export const matchesSet = (locationId: string, source: string) => source === locationId || source.endsWith(`/${locationId}`)

/** index.json: ["id", ...], [{ id }, ...] or { performances: [...] } of either. */
export function parseIndex(json: unknown): string[] {
  const list = Array.isArray(json) ? json : (json as { performances?: unknown } | null)?.performances
  if (!Array.isArray(list)) return []
  const ids = list.map((x) => (typeof x === 'string' ? x : (x as { id?: unknown } | null)?.id)).filter((x): x is string => typeof x === 'string')
  return ids.filter((id) => /^[\w-]+$/.test(id))
}
