/**
 * GET /__lab/l2r/shots?world=<worldId> -> ShotsListResponse: every locked take of one world, newest lock first, with what its
 * renders already say on disk (free, read-only). The Render page lists them as the scene's shots and Export offers each finished
 * one for download; the per-take status (GET /__lab/l2r?take=) stays the one poller for the take on show.
 */

export const SHOTS_ROUTE = '/__lab/l2r/shots'

/** the newest render's state: none yet, out on Cloud, back raw (the free finish not landed), finished, or stopped with an error */
export type ShotState = 'none' | 'rendering' | 'raw' | 'finished' | 'failed'

export interface ShotRow {
  takeId: string
  lockedAt: string
  frames: number
  state: ShotState
  /** the newest render that came back (finished, else raw): what Play and Download use; null = nothing to play */
  video: string | null
  /** that render's id, and whether its free finish landed */
  renderId: string | null
  finished: boolean
  /** the credits that render billed, when the balance was measured (null = not known, or nothing billed yet) */
  credits: number | null
  /** the take's approved opening still (its picture), else null: the row then shows a frame of the render */
  thumb: string | null
}

export interface ShotsListResponse { shots: ShotRow[] }
