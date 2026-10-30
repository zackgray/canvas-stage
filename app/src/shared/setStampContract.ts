/**
 * The set a take's frames and still were made on (PLAN-PER-TAKE-SET.md, Guards), stamped beside the walk's `packId`. Pure; shotContract.ts
 * lays these onto ClayExport, ClayFinishRequest and HeroStill in one line each.
 *
 * `setKey` = setKeyOf(the kit plan on the stage) (src/studio/shoot/setKey.ts), the hash TakeRecord.setKey is. The page sends it on the
 * clay finish (the key of the set every frame was captured on); the server refuses a finish whose key is not the take's (409, nothing
 * written), stores it on clay.json, and stamps the take's key on a still when it is drawn. Absent = made before the stamp: judged by
 * date (made after take.setSince for a take with its own set, else after the world's setChangedAt, as before).
 */
export interface SetStampFields {
  /** the set key the frames / the still were made on (null = no kit set) */
  setKey?: string | null
}

export const SET_STAMP_MISMATCH = 'These frames were prepared on another set than this take\'s. Pick the take again so its own set is on the stage, then prepare the frames again (free). Nothing was saved.'
export const SET_STAMP_STALE = 'These frames were prepared on another set than this take\'s.'
