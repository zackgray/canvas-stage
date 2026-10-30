/**
 * What a clay's frames were captured from, stamped on clay.json (ClayExport) at the finish (PLAN-PER-TAKE-PERFORMANCE.md §2,
 * PLAN-PER-TAKE-SET.md Guards): `packId` = the performer the page played while it captured (a take's walk is its own now, so frames
 * of another walk must never pass as the take's) and `setKey` = the key of the set every frame was captured on. The page sends both
 * on the finish body; the finish refuses a walk that is not the take's here (409) and a set that is not the take's in setFinish.ts
 * (it needs the scene's set); a stored stamp that is not the take's reads as not prepared everywhere frames are read (Render's
 * readiness, the still's depth). A clay with no stamp (made before this) passes here: the date rule judges its set (takes/setJudge.ts).
 */
import type { ClayExport, TakeRecord } from '../../src/shared/shotContract.ts'

export interface ClayStamps { packId?: string | null; setKey?: string | null }

export const PACK_STAMP_MISMATCH = 'These frames were prepared with another walk than this take\'s. Pick the take again so its own walk is on the set, then prepare the frames again (free). Nothing was saved.'
export const PACK_STAMP_STALE = 'These frames were prepared with another walk than this take\'s.'
export { SET_STAMP_MISMATCH, SET_STAMP_STALE } from '../../src/shared/setStampContract.ts'

/** one optional stamp: absent stays absent (an older page), null = none, else a non-empty string; anything else is the error's words */
function stampField(raw: unknown, name: 'packId' | 'setKey', what: string): { v?: string | null } | string {
  const p = (raw as Record<string, unknown> | null)?.[name]
  if (p === undefined) return {}
  if (p !== null && (typeof p !== 'string' || !p)) return `${name} must be ${what}, or null for none`
  return { v: p as string | null }
}

/** the stamps on a finish body: absent fields stay absent (an older page); a field of the wrong type is an error */
export function parseClayStamps(raw: unknown): ClayStamps | string {
  const pack = stampField(raw, 'packId', 'the performer\'s pack id')
  if (typeof pack === 'string') return pack
  const set = stampField(raw, 'setKey', 'the set\'s key')
  if (typeof set === 'string') return set
  return { ...('v' in pack ? { packId: pack.v } : {}), ...('v' in set ? { setKey: set.v } : {}) }
}

/** a finish whose walk is not the take's: the 409's words, else null (the set's check is setFinish.ts setFinishRefusal) */
export function stampRefusal(take: Pick<TakeRecord, 'packId'>, s: ClayStamps): string | null {
  return s.packId !== undefined && s.packId !== (take.packId ?? null) ? PACK_STAMP_MISMATCH : null
}

/** a stored clay stamped with another set than the keyed take's (unstamped clays and takes with no set key pass) */
export const claySetStampStale = (take: Pick<TakeRecord, 'setKey'>, clay: Pick<ClayExport, 'setKey'>): boolean =>
  !!take.setKey && clay.setKey !== undefined && clay.setKey !== take.setKey

/** a stored clay stamped for another walk, or another set, than the take's (unstamped clays pass) */
export const clayStampStale = (take: Pick<TakeRecord, 'packId' | 'setKey'>, clay: Pick<ClayExport, 'packId' | 'setKey'>): boolean =>
  (clay.packId !== undefined && clay.packId !== (take.packId ?? null)) || claySetStampStale(take, clay)
