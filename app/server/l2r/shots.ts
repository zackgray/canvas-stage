/**
 * GET /__lab/l2r/shots?world= (src/shared/shotsListContract.ts): one world's locked takes and what their renders say, read from
 * the take folders in one pass (no per-take status polls). Free and read-only apart from what listRenders already does on any
 * status read (a `running` record no live job covers is filed `failed`, so it is never shown as rendering for good).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { SHOTS_DIR, type L2RRender, type TakeRecord } from '../../src/shared/shotContract.ts'
import type { ShotRow, ShotState } from '../../src/shared/shotsListContract.ts'
import type { JobStore } from '../jobs/index.ts'
import { approvedStill } from './inputs.ts'
import { shotDirs, TAKE_RE } from './spec.ts'
import { listRenders } from './store.ts'

const readTake = (f: string): TakeRecord | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as TakeRecord } catch { return null } }

/** the newest render's state in the Render list's words */
export function shotState(newest: L2RRender | undefined): ShotState {
  if (!newest) return 'none'
  if (newest.status === 'running' || newest.status === 'queued') return 'rendering'
  if (newest.status === 'done') return newest.finished ? 'finished' : 'raw'
  return 'failed'
}

/** one take's row: the newest render's state, the newest render that came back (to play and download), the still as its picture */
export function shotRow(publicDir: string, take: TakeRecord, store?: JobStore): ShotRow {
  const renders = listRenders(publicDir, take.id, store)
  const back = renders.find((r) => r.status === 'done' && (r.finished ?? r.raw))
  return {
    takeId: take.id, lockedAt: take.lockedAt, frames: take.frames, state: shotState(renders[0]),
    video: back ? (back.finished ?? back.raw) : null, renderId: back?.id ?? null, finished: !!back?.finished,
    credits: back && !back.creditsEstimated && back.credits > 0 ? back.credits : null,
    thumb: approvedStill(shotDirs(publicDir, take.id).hero, take.id)?.png ?? null,
  }
}

/** every locked take of `worldId`, newest lock first */
export function shotRows(publicDir: string, worldId: string, store?: JobStore): ShotRow[] {
  const root = path.join(publicDir, ...SHOTS_DIR.split('/'))
  if (!existsSync(root)) return []
  return readdirSync(root).filter((t) => TAKE_RE.test(t))
    .map((t) => { const r = readTake(shotDirs(publicDir, t).take); return r?.id === t ? r : null }) // a record must be its own folder's
    .filter((t): t is TakeRecord => !!t && t.worldId === worldId)
    .sort((a, b) => b.lockedAt.localeCompare(a.lockedAt))
    .map((t) => shotRow(publicDir, t, store))
}
