/**
 * The L2R records on disk: shots/<takeId>/l2r/<renderId>.json (L2RRender), written atomically. The record is written with
 * status `running` BEFORE the paid submit (it is the intent: a job recovered by id can always be put back) and rewritten as
 * the job and the finish land. A free refusal removes it again. A `running` record with no job behind it whose process died,
 * or that no live claim of this process covers, never reached Cloud: read back, it is rewritten `failed` + `interrupted`
 * (never billed, credits 0) so the Render button comes back.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { replaceFileSync } from '../replace.ts'
import type { L2RRender } from '../../src/shared/shotContract.ts'
import { SHOTS_DIR } from '../../src/shared/shotContract.ts'
import type { JobStore } from '../jobs/index.ts'
import { claimOf, isLive, pidAlive } from '../jobs/index.ts'
import { L2R_KEY, l2rLabel, RENDER_RE, shotDirs, TAKE_RE } from './spec.ts'

export const recordFile = (publicDir: string, takeId: string, renderId: string) => {
  if (!RENDER_RE.test(renderId)) throw new Error(`bad render id ${renderId}`)
  return path.join(shotDirs(publicDir, takeId).l2r, `${renderId}.json`)
}

export function writeRender(publicDir: string, r: L2RRender): L2RRender {
  const f = recordFile(publicDir, r.takeId, r.id)
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(`${f}.tmp`, JSON.stringify(r, null, 2) + '\n')
  replaceFileSync(`${f}.tmp`, f) // a reader holding it open refuses a bare rename on Windows
  return r
}

export const removeRender = (publicDir: string, takeId: string, renderId: string) => rmSync(recordFile(publicDir, takeId, renderId), { force: true })

export function readRender(publicDir: string, takeId: string, renderId: string): L2RRender | null {
  try { const r = JSON.parse(readFileSync(recordFile(publicDir, takeId, renderId), 'utf8')) as L2RRender; return r?.id === renderId ? r : null } catch { return null }
}

/** a take's renders, newest first; a `running` record whose job is no longer live says so (recover by id) */
export function listRenders(publicDir: string, takeId: string, store?: JobStore): L2RRender[] {
  const dir = shotDirs(publicDir, takeId).l2r
  if (!existsSync(dir)) return []
  const out: L2RRender[] = []
  for (const f of readdirSync(dir)) {
    const id = f.replace(/\.json$/, '')
    if (!f.endsWith('.json') || !RENDER_RE.test(id)) continue
    const r = readRender(publicDir, takeId, id)
    if (r) out.push(store ? withJob(publicDir, r, store) : r)
  }
  return out.sort((a, b) => (b.createdAt ?? b.id).localeCompare(a.createdAt ?? a.id))
}

/** how long an intent written by another live process is believed without a job record (its validate + lock wait) */
const OTHER_PROCESS_MS = 20 * 60_000
export const INTERRUPTED ='Interrupted before it was sent to Cloud (the dev server stopped or restarted): nothing was billed. Render again.'

/**
 * An intent with no job record is either the request in flight now (this process holds the L2R claim, taken before the
 * intent was written, and is validating or waiting for the runner's lock) or one that died before submitting.
 */
function inFlightHere(r: L2RRender, now = Date.now()): boolean {
  if (!pidAlive(r.pid)) return false
  // another live process (a second dev server; claims are per process): trusted for a while, then read as a reused pid
  if (r.pid !== process.pid) return !!r.createdAt && now - Date.parse(r.createdAt) < OTHER_PROCESS_MS
  const c = claimOf(L2R_KEY)
  return !!c && !!r.createdAt && Date.parse(c.since) <= Date.parse(r.createdAt)
}

/** fill a running record's job id from the runner, and mark it failed when no live process waits on it any more */
function withJob(publicDir: string, r: L2RRender, store: JobStore): L2RRender {
  if (r.status !== 'running' && r.status !== 'queued') return r
  const rec = store.list().find((j) => j.label === l2rLabel(r.takeId, r.id))
  if (!rec) {
    if (r.jobId || inFlightHere(r)) return r
    // never submitted: the runner writes its record before the billed call, and there is none
    return writeRender(publicDir, { ...r, status: 'failed', interrupted: true, credits: 0, jobId: null, error: INTERRUPTED })
  }
  const jobId = r.jobId ?? rec.jobId ?? null
  if (isLive(rec)) return { ...r, jobId }
  if (rec.status === 'done') return { ...r, jobId, status: 'failed', error: `job ${jobId} finished but its video was not filed here: recover it by id (free, never resubmitted)` }
  return { ...r, jobId, status: 'failed', error: rec.error ?? `the wait for job ${jobId ?? '(no id yet)'} was lost: recover it by id, do not resubmit` }
}

/** every take folder's renders (for the price basis and finding a render by id) */
export function allRenders(publicDir: string): L2RRender[] {
  const root = path.join(publicDir, ...SHOTS_DIR.split('/'))
  if (!existsSync(root)) return []
  return readdirSync(root).filter((t) => TAKE_RE.test(t)).flatMap((t) => listRenders(publicDir, t))
}

export const findRender = (publicDir: string, renderId: string): L2RRender | null =>
  RENDER_RE.test(renderId) ? allRenders(publicDir).find((r) => r.id === renderId) ?? null : null
