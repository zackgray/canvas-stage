/**
 * Paid jobs in flight, per scene (libraryContract.ts SceneJobRecord): lab-assets/scene/<sceneId>/jobs/<jobId>.json. The page names
 * the job before it sends (headers x-canvas-scene / x-canvas-job); `captureJobs` runs in front of every paid route, writes the
 * record `running` before the route sees the request, and rewrites it `done` with the route's own reply when the route answers,
 * whether or not the page is still there to read it (M1: leaving Scene or reloading never loses a paid result). A job id is sent
 * once: the same id again is refused (409), so a page that re-sends after a reload can never pay twice, and so is a second job of the
 * same scene, intent and target while one runs (another tab's double press). The route runs as the job (server/jobs/context.ts):
 * behind another paid job of any scene it waits its turn instead of being refused, and its record says `waiting` meanwhile.
 * Free; nothing here submits.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import {
  intentOfRoute, JOB_HEADERS, JOB_ID_RE, JOB_ROUTES, JOB_TARGET_RE, SCENE_ID_RE, type JobIntent, type SceneJobRecord,
} from '../../src/shared/libraryContract.ts'
import { withJobContext } from '../jobs/context.ts'
import { MAX_LIVE_MS, pidAlive } from '../jobs/inflight.ts'
import { replaceFileSync } from '../replace.ts'

const header = (req: IncomingMessage, name: string) => { const v = req.headers[name]; return Array.isArray(v) ? v[0] : v }
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * A finished job whose `done` record could not be written (the disk refused even after replace.ts's retries): its reply is kept
 * here, by record file, until it is claimed, so this server process still hands it out. On globalThis, like the library's lock, so
 * the handler of a job sent before an in-process Vite restart and the store after it see one copy.
 */
const KEPT: Map<string, SceneJobRecord> = ((globalThis as { __canvasKeptJobs?: Map<string, SceneJobRecord> }).__canvasKeptJobs ??= new Map())

export interface JobRecordsOptions {
  /** puts the finished temp file over the record (tests inject a refused rename) */
  replace?: (tmp: string, dest: string) => void
  /** where a write the disk refused is reported */
  log?: (line: string) => void
}
let writes = 0

export const ALREADY_RUNNING = 'This is already running.'

export class JobRecords {
  private readonly root: string
  private readonly now: () => Date
  private readonly replace: (tmp: string, dest: string) => void
  private readonly log: (line: string) => void
  constructor(publicDir: string, now: () => Date = () => new Date(), o: JobRecordsOptions = {}) {
    this.root = path.join(publicDir, 'lab-assets', 'scene'); this.now = now
    this.replace = o.replace ?? replaceFileSync
    this.log = o.log ?? ((line) => console.error(line))
  }

  private dir(scene: string) { if (!SCENE_ID_RE.test(scene)) throw new Error('bad scene id'); return path.join(this.root, scene, 'jobs') }
  private file(scene: string, id: string) { if (!JOB_ID_RE.test(id)) throw new Error('bad job id'); return path.join(this.dir(scene), `${id}.json`) }
  sceneExists(scene: string) { return SCENE_ID_RE.test(scene) && existsSync(path.join(this.root, scene, 'scene.json')) }

  private write(r: SceneJobRecord) {
    const f = this.file(r.scene, r.id)
    mkdirSync(path.dirname(f), { recursive: true })
    // a temp of its own per write, and a rename Windows refuses while a reader holds the record is retried, then copied over
    const tmp = `${f}.${process.pid}.${++writes}.tmp`
    try { writeFileSync(tmp, JSON.stringify(r, null, 1) + '\n'); this.replace(tmp, f) } finally { rmSync(tmp, { force: true }) }
  }

  /**
   * a record as it stands; a `running` one whose server process is gone, or that has RUN longer than any job can wait, reads
   * `lost`. Time spent waiting its turn does not count (m-4): a job queued behind two long renders is alive, not lost.
   */
  read(scene: string, id: string): SceneJobRecord | null {
    const r = this.raw(scene, id)
    if (!r) return null
    const tooOld = !r.waiting && Date.now() - Date.parse(r.ranAt ?? r.startedAt) > MAX_LIVE_MS
    // released (jobs/release.ts): the queue no longer waits for it, so it no longer counts as running; its Cloud job id stays on it
    if (r.status === 'running' && (!pidAlive(r.pid) || tooOld || r.released)) return { ...r, status: 'lost' }
    return r
  }

  /** the record as stored, whatever it says */
  raw(scene: string, id: string): SceneJobRecord | null {
    const kept = KEPT.get(this.file(scene, id))
    if (kept) return kept
    try { return JSON.parse(readFileSync(this.file(scene, id), 'utf8')) as SceneJobRecord } catch { return null }
  }

  /** the job the press submitted to Cloud (the latest one): written down at once so a restart or a release cannot lose its id */
  noteCloud(rec: SceneJobRecord, cloudJobId: string): void {
    rec.cloudJobId = cloudJobId
    try { this.write(rec) } catch (e) { this.log(`[jobs] paid job ${rec.id} (scene ${rec.scene}) could not record its Cloud id ${cloudJobId}: ${msg(e)}`) }
  }

  /** a running job nothing will answer for any more is written down as released: reads `lost`, the queue moves on, the Cloud id stays */
  markReleased(scene: string, id: string): SceneJobRecord | null {
    const r = this.raw(scene, id)
    if (!r || r.status !== 'running') return null
    const rel = { ...r, released: this.now().toISOString() }
    this.write(rel)
    return rel
  }

  list(scene: string): SceneJobRecord[] {
    const dir = this.dir(scene)
    const kept = [...KEPT.values()].filter((r) => r.scene === scene).map((r) => r.id)
    const onDisk = existsSync(dir) ? readdirSync(dir).map((n) => /^(j-[\w-]+)\.json$/.exec(n)?.[1]) : []
    return [...new Set([...onDisk, ...kept])].filter((n): n is string => !!n && JOB_ID_RE.test(n))
      .map((id) => this.read(scene, id)).filter((r): r is SceneJobRecord => !!r).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  }

  /** the first caller claims a finished (or lost) job's result; the record is removed. A running job is not cleared. */
  clear(scene: string, id: string): { cleared: boolean } {
    const r = this.read(scene, id)
    if (!r || r.status === 'running') return { cleared: false }
    KEPT.delete(this.file(scene, id))
    rmSync(this.file(scene, id), { force: true })
    return { cleared: true }
  }

  start(r: Omit<SceneJobRecord, 'status' | 'startedAt' | 'pid'>): SceneJobRecord {
    const rec: SceneJobRecord = { ...r, status: 'running', startedAt: this.now().toISOString(), pid: process.pid }
    this.write(rec)
    return rec
  }

  /** the job is queued behind another paid job (or has its turn now); a refused write only loses the word, never the job */
  wait(rec: SceneJobRecord, on: boolean): void {
    if (!!rec.waiting === on) return
    if (on) rec.waiting = true; else { delete rec.waiting; rec.ranAt = this.now().toISOString() }
    try { this.write(rec) } catch (e) { this.log(`[jobs] paid job ${rec.id} (scene ${rec.scene}) could not be marked ${on ? 'waiting' : 'started'}: ${msg(e)}`) }
  }

  finish(rec: SceneJobRecord, status: number, text: string): void {
    let body: unknown = null
    try { body = text ? JSON.parse(text) : null } catch { body = { error: text.slice(0, 500) } }
    const { waiting: _w, ...ran } = rec
    const done: SceneJobRecord = { ...ran, status: 'done', finishedAt: this.now().toISOString(), reply: { status, body } }
    const f = this.file(rec.scene, rec.id)
    try { this.write(done); KEPT.delete(f) } catch (e) {
      // the paid result must not be lost to a refused write: this process keeps handing it out, and the failure is said
      KEPT.set(f, done)
      this.log(`[jobs] the result of paid job ${rec.id} (scene ${rec.scene}) could not be saved to disk (${msg(e)}); this server keeps it until it is claimed or the server stops`)
    }
  }

  exists(scene: string, id: string) { return KEPT.has(this.file(scene, id)) || existsSync(this.file(scene, id)) }

  /** a job of any scene still running for `target` (a take id) among `intents`: what is filed under it must not move meanwhile */
  runningFor(target: string, intents: readonly JobIntent[]): SceneJobRecord | null {
    if (!existsSync(this.root)) return null
    for (const scene of readdirSync(this.root)) {
      if (!SCENE_ID_RE.test(scene)) continue
      const hit = this.list(scene).find((r) => r.status === 'running' && r.target === target && intents.includes(r.intent))
      if (hit) return hit
    }
    return null
  }
}

type Next = (err?: unknown) => void
const refuse = (res: ServerResponse, status: number, error: string) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ error }))
}

/**
 * Connect middleware, mounted before every paid route. A POST without the job headers passes untouched (tests, scripts). With
 * them: the route must be one of JOB_ROUTES (else 400), the scene must exist (404), the job id must be new and the same intent and
 * target not running in this scene (409); then the record is written `running`, the route runs as the job (queued, not refused,
 * behind another paid job), the response is captured as the route writes it, and the record becomes `done` with that reply.
 */
export function captureJobs(records: JobRecords) {
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const scene = header(req, JOB_HEADERS.scene), id = header(req, JOB_HEADERS.job)
    if (req.method !== 'POST' || (!scene && !id)) return next()
    const pathname = new URL(req.url ?? '/', 'http://local').pathname
    const intent = intentOfRoute(pathname)
    if (!intent) return refuse(res, 400, 'only a paid route is sent as a job')
    if (!scene || !id || !SCENE_ID_RE.test(scene) || !JOB_ID_RE.test(id)) return refuse(res, 400, 'bad scene or job id')
    if (!records.sceneExists(scene)) return refuse(res, 404, 'no such scene')
    if (records.exists(scene, id)) return refuse(res, 409, 'this job was already sent; its result is kept under its id')
    const raw = header(req, JOB_HEADERS.target) ?? intent
    const target = JOB_TARGET_RE.test(raw) ? raw : intent
    if (records.list(scene).some((r) => r.status === 'running' && r.intent === intent && r.target === target)) return refuse(res, 409, ALREADY_RUNNING)
    const price = Number(header(req, JOB_HEADERS.price))
    const rec: SceneJobRecord = records.start({ id, scene, intent, target, price: Number.isFinite(price) ? price : null, route: JOB_ROUTES[intent] })
    const chunks: Buffer[] = []
    const write = res.write.bind(res) as (...a: unknown[]) => boolean
    const end = res.end.bind(res) as (...a: unknown[]) => ServerResponse
    const keep = (c: unknown, enc?: unknown) => {
      if (c === undefined || c === null || typeof c === 'function') return
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string, typeof enc === 'string' ? (enc as BufferEncoding) : 'utf8'))
    }
    let done = false
    ;(res as unknown as { write: (...a: unknown[]) => boolean }).write = (...a: unknown[]) => { keep(a[0], a[1]); return write(...a) }
    ;(res as unknown as { end: (...a: unknown[]) => ServerResponse }).end = (...a: unknown[]) => {
      if (!done) {
        done = true
        keep(a[0], a[1])
        // the reply goes out whatever the record does; a record that could not be finished is said, never swallowed
        try { records.finish(rec, res.statusCode, Buffer.concat(chunks).toString('utf8')) } catch (e) { console.error(`[jobs] paid job ${rec.id} could not be recorded as finished: ${msg(e)}`) }
      }
      return end(...a)
    }
    // the page left (tab closed, reload, fetch aborted): a job still waiting its turn is dropped (server/jobs/context.ts)
    let gone = false
    res.on('close', () => { if (!res.writableEnded) gone = true })
    withJobContext({ scene, id, intent, target, cloud: (c) => records.noteCloud(rec, c), waiting: (on) => { if (!done) records.wait(rec, on) }, gone: () => gone }, () => next())
  }
}
