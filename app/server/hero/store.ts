/**
 * The hero stills' files, all derived from disk (public/lab-assets/shots/<takeId>/hero/):
 *   opening.png (+ opening.json {startKey})   the take's frame 0, uploaded by the browser
 *   intent-<id>.json   the HeroStill minus its job and cost, written BEFORE the spend
 *   <id>.png, then <id>.json LAST   a still exists once its json does; an intent whose png landed without its json (a job
 *                                   recovered by id, a crash after the download) is completed on read from the job record
 * Nothing here submits.
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { SHOTS_DIR, shotPaths, type HeroStill, type TakeRecord } from '../../src/shared/shotContract.ts'
import { isLive, type JobRecord, type JobStore } from '../jobs/index.ts'
import { replaceFile } from '../replace.ts'
import { isHeroLabel, STILL_ID_RE, TAKE_ID_RE } from './spec.ts'

export class HeroHttpError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, message: string, code: string) { super(message); this.status = status; this.code = code }
}

/** whole through a temp name, put in place by replaceFile, not a bare rename: Windows refuses a rename over a file a reader holds
 *  open that instant (a page polling the candidate or still it watches), and one refused write left a billed pass 'running' for good */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n')
  await replaceFile(`${file}.tmp`, file)
}
export async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T } catch { return null }
}

/** The take id from a request, checked: only `take-…` names, nothing that can climb out of shots/. */
export function takeIdOf(raw: unknown): string {
  if (typeof raw !== 'string' || !TAKE_ID_RE.test(raw)) throw new HeroHttpError(400, 'take must be a take-… id', 'bad_request')
  return raw
}
export function stillIdOf(raw: unknown): string {
  if (typeof raw !== 'string' || !STILL_ID_RE.test(raw)) throw new HeroHttpError(400, 'stillId must be a hero-… id', 'bad_request')
  return raw
}

export const heroDirOf = (publicDir: string, takeId: string) => path.join(publicDir, shotPaths(takeId).hero)
export const heroUrl = (takeId: string, file: string) => `/${SHOTS_DIR}/${takeId}/hero/${file}`
export const openingFile = (publicDir: string, takeId: string) => path.join(heroDirOf(publicDir, takeId), 'opening.png')

export async function readTake(publicDir: string, takeId: string): Promise<TakeRecord> {
  const t = await readJson<TakeRecord>(path.join(publicDir, shotPaths(takeId).take))
  if (!t || t.id !== takeId) throw new HeroHttpError(404, `${takeId} is not a locked take on disk`, 'not_found')
  return t
}

export interface OpeningInfo { present: boolean; startKey: string | null }
export async function openingInfo(publicDir: string, takeId: string): Promise<OpeningInfo> {
  const dir = heroDirOf(publicDir, takeId)
  const meta = await readJson<{ startKey?: string }>(path.join(dir, 'opening.json'))
  return { present: existsSync(path.join(dir, 'opening.png')), startKey: meta?.startKey ?? null }
}

const intentFile = (dir: string, id: string) => path.join(dir, `intent-${id}.json`)
export const stillFile = (dir: string, id: string) => path.join(dir, `${id}.json`)
export { intentFile }

/** the newest hero job naming `token` exactly: a still id is its finish (or one-step) job, `<id>-draw` a kit still's draw job */
const recordOf = (store: JobStore, token: string): JobRecord | undefined => store.list().find((r) => isHeroLabel(r.label) && r.label.split(' ').slice(2).includes(token))
const shareOf = (r: JobRecord | undefined): number | null => (r?.costCredits != null ? r.costCredits / Math.max(1, r.label.split(' ').length - 2) : null)

/** Every still of a take, newest first; completes an intent whose png landed without its json. */
export async function listStills(publicDir: string, takeId: string, store: JobStore): Promise<HeroStill[]> {
  const dir = heroDirOf(publicDir, takeId)
  if (!existsSync(dir)) return []
  const names = await readdir(dir)
  for (const f of names) {
    const m = /^intent-(hero-[\w-]+)\.json$/.exec(f)
    if (!m || !STILL_ID_RE.test(m[1]) || names.includes(`${m[1]}.json`) || !names.includes(`${m[1]}.png`)) continue
    const read = await readJson<HeroStill & { finish?: unknown }>(path.join(dir, f))
    if (!read?.id) continue
    const { finish: _finish, ...intent } = read // a kit intent's finish inputs are not part of the still
    const job = recordOf(store, intent.id), own = shareOf(job), drew = shareOf(recordOf(store, `${intent.id}-draw`))
    await writeJson(stillFile(dir, intent.id), { ...intent, jobId: job?.jobId ?? intent.jobId ?? null, credits: own != null ? Math.round((own + (drew ?? 0)) * 100) / 100 : intent.credits ?? 0 })
  }
  const out: HeroStill[] = []
  for (const f of await readdir(dir)) {
    const m = /^(hero-[\w-]+)\.json$/.exec(f)
    if (!m || !STILL_ID_RE.test(m[1]) || !existsSync(path.join(dir, `${m[1]}.png`))) continue
    const s = await readJson<HeroStill>(path.join(dir, f))
    if (s?.id === m[1] && s.takeId === takeId) out.push({ ...s, png: heroUrl(takeId, `${s.id}.png`) })
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}

export interface UnrecoveredHero { jobId: string; recordId: string; ids: string[]; since: string }

/** Paid hero jobs of this take whose png never landed. Recover by id (free): POST /__lab/jobs/recover. */
export function unrecovered(store: JobStore, publicDir: string, takeId: string): UnrecoveredHero[] {
  const dir = heroDirOf(publicDir, takeId)
  return store.list().filter((r) => {
    if (!isHeroLabel(r.label) || !r.jobId || r.label.split(' ')[1] !== takeId) return false
    if (!(r.status === 'needs-recover' || ((r.status === 'waiting' || r.status === 'submitting') && !isLive(r)))) return false
    // a kit draw (`<id>-draw`) is in once its png is; a still once its json is
    return r.label.split(' ').slice(2).some((id) => !existsSync(path.join(dir, id.endsWith('-draw') ? `${id}.png` : `${id}.json`)))
  }).map((r) => ({ jobId: r.jobId!, recordId: r.id, ids: r.label.split(' ').slice(2), since: r.createdAt }))
}

let chain: Promise<unknown> = Promise.resolve()
/** Approve/un-approve run one at a time, so two presses cannot leave two approved stills. */
export const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = chain.then(fn, fn)
  chain = next.catch(() => {})
  return next
}

/** the keyframe a still guides (absent = the opening, as every still before the Bible) */
const roleOf = (s: HeroStill) => s.role ?? 'opening'

/** Exactly one approved still per take and keyframe role: the chosen one is approved, every other of its role is un-approved. Stale stills cannot be approved. */
export async function approveStill(publicDir: string, take: TakeRecord, stillId: string, store: JobStore): Promise<HeroStill> {
  return serial(async () => {
    const dir = heroDirOf(publicDir, take.id)
    const all = await listStills(publicDir, take.id, store)
    const pick = all.find((s) => s.id === stillId)
    if (!pick) throw new HeroHttpError(404, `${stillId} is not a still of ${take.id}`, 'not_found')
    if (pick.startKey !== take.startKey) throw new HeroHttpError(409, 'that still shows an older start of the take (the camera or performance frame changed): render it again', 'stale')
    for (const s of all) if (s.approved && s.id !== stillId && roleOf(s) === roleOf(pick)) await writeJson(stillFile(dir, s.id), { ...s, approved: false })
    const done: HeroStill = { ...pick, approved: true }
    await writeJson(stillFile(dir, stillId), done)
    return done
  })
}

/** Take the approval off a still (Render needs an approved opening again). Nothing else changes; an unapproved still stays as it is. */
export async function unapproveStill(publicDir: string, take: TakeRecord, stillId: string, store: JobStore): Promise<HeroStill> {
  return serial(async () => {
    const all = await listStills(publicDir, take.id, store)
    const pick = all.find((s) => s.id === stillId)
    if (!pick) throw new HeroHttpError(404, `${stillId} is not a still of ${take.id}`, 'not_found')
    const { png: _png, ...onDisk } = pick // the png is derived on read, as approveStill writes it
    const done: HeroStill = { ...pick, approved: false }
    await writeJson(stillFile(heroDirOf(publicDir, take.id), stillId), { ...onDisk, approved: false })
    return done
  })
}
