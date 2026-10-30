/**
 * The fake motion box: an in-process HTTP server implementing docs/motion-box-contract.md for the plugin's tests (and
 * for local development before the real service exists). It serves every try's BVH from the shipped lift clip under
 * public/mocap/kimodo and walks each job through the contract's stages, try by try, so polls see progress.
 */
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { BoxHealth, BoxJobStatus, BoxTry } from './types.ts'

export type FakeBoxOptions = {
  /** folder with lift_frame.bvh, served as every try's retargeted BVH. */
  fixturesDir: string
  /** bearer token the box requires (like the real one); a wrong/missing token -> 401. */
  token?: string
  /** of tries per job. */
  n?: number
  /** ms per try, so a whole round finishes quickly in tests. */
  tryDelayMs?: number
  /** force /health's state (e.g. warming) regardless of jobs. */
  healthState?: BoxHealth['state']
}

const SCORES = { grip_m: 0.439, grip_std_m: 0.018, slide_cms: 0.66, jitter_mm: 0.54, root_travel_m: 0.04 }
const REASONS = ['steadiest hands', 'cleanest feet', 'closest to the piece']
const DROP_REASON = "the hands didn't hold the frame steadily"

type FakeJob = BoxJobStatus & { seeds: number[]; nextTry: number; timer: NodeJS.Timeout | null }

export type FakeBox = {
  url: string
  close(): Promise<void>
  jobIds(): string[]
}

export async function startFakeBox(opts: FakeBoxOptions): Promise<FakeBox> {
  const n = opts.n ?? 8
  const tryDelayMs = opts.tryDelayMs ?? 5
  const jobs = new Map<string, FakeJob>()
  let seq = 0
  let fixture: Buffer | null = null

  const top3 = (job: FakeJob): BoxTry[] => {
    const count = Math.min(3, job.tries.length)
    return job.tries.slice(0, count)
  }

  const tick = (job: FakeJob) => {
    if (job.stage === 'cancelled') return
    if (job.nextTry < job.seeds.length) {
      const i = job.nextTry++
      job.stage = i === 0 ? 'encoding' : 'generating'
      job.tries.push({ id: i, seed: job.seeds[i], rank: 0, reason: '', scores: { ...SCORES }, seconds: 3.8 })
      job.done = job.tries.length
      job.timer = setTimeout(tick, tryDelayMs, job)
      return
    }
    job.stage = 'scoring'
    job.timer = setTimeout(() => {
      job.tries = job.tries
        .map((t, i) => ({ ...t, rank: i + 1, reason: REASONS[i] ?? 'steady hold' }))
        .sort((a, b) => a.rank - b.rank)
      job.dropped = { count: job.seeds.length - Math.min(3, job.tries.length), reason: DROP_REASON }
      job.stage = 'retargeting'
      job.timer = setTimeout(() => { job.stage = 'done'; job.timer = null }, tryDelayMs)
    }, tryDelayMs)
  }

  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.statusCode = code
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = new URL(req.url ?? '', 'http://box')
      const m = /^\/jobs\/([^/]+)(?:\/(cancel|files\/(\d+)\.(bvh|png|json)))?$/.exec(url.pathname)
      if (opts.token) {
        const ok = req.headers.authorization === `Bearer ${opts.token}`
        if (!ok) return json(res, 401, { error: 'unauthorized' })
      }
      if (url.pathname === '/health' && req.method === 'GET') {
        const busy = [...jobs.values()].some((j) => !['done', 'failed', 'cancelled'].includes(j.stage))
        const health: BoxHealth = { state: opts.healthState ?? (busy ? 'busy' : 'ready'), gpu: { name: 'Fake GPU', freeMiB: 20480 }, encoder: 'cpu (fake)', version: 'fake-1' }
        return json(res, 200, health)
      }
      if (url.pathname === '/jobs' && req.method === 'POST') {
        let body: { spec?: unknown; n?: unknown; seeds?: unknown }
        try { body = JSON.parse(await readBody(req)) } catch { return json(res, 400, { error: 'bad JSON' }) }
        const spec = body.spec as Record<string, unknown> | null
        if (!spec || typeof spec.sentence !== 'string' || typeof spec.seconds !== 'number') return json(res, 422, { error: 'bad spec', message: 'spec needs sentence, seconds, …' })
        const running = [...jobs.values()].filter((j) => !['done', 'failed', 'cancelled'].includes(j.stage))
        if (running.length >= 2) return json(res, 409, { error: 'busy' }) // one GPU job at a time, a queue of 1
        const count = Math.min(8, Math.max(1, typeof body.n === 'number' ? Math.floor(body.n) : n))
        const id = `fake-job-${++seq}`
        const seeds = Array.isArray(body.seeds) && body.seeds.length >= count ? body.seeds.slice(0, count) : Array.from({ length: count }, (_, i) => 53 + i)
        const job: FakeJob = { id, stage: 'encoding', done: 0, of: count, round: 1, tries: [], dropped: { count: 0, reason: '' }, seeds, nextTry: 0, timer: null }
        jobs.set(id, job)
        tick(job)
        return json(res, 201, { id })
      }
      if (!m) return json(res, 404, { error: 'no such route' })
      const job = jobs.get(m[1])
      if (!job) return json(res, 404, { error: 'no such job' })
      if (!m[2] && req.method === 'GET') return json(res, 200, { ...job, tries: top3(job) } as BoxJobStatus)
      if (m[2] === 'cancel' && req.method === 'POST') {
        if (job.timer) clearTimeout(job.timer)
        job.stage = 'cancelled'
        return json(res, 200, { stage: job.stage })
      }
      if (m[2]?.startsWith('files/')) {
        if (req.method !== 'GET') return json(res, 405, { error: 'GET only' })
        const tryId = Number(m[3])
        if (!job.tries.some((t) => t.id === tryId)) return json(res, 404, { error: 'no such try' })
        if (m[4] === 'bvh') {
          fixture ??= await readFile(`${opts.fixturesDir}/lift_frame.bvh`)
          res.setHeader('content-type', 'application/octet-stream')
          return res.end(fixture)
        }
        if (m[4] === 'png') {
          res.setHeader('content-type', 'image/png')
          return res.end(Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex'))
        }
        const t = job.tries.find((x) => x.id === tryId)!
        return json(res, 200, { seed: t.seed, scores: t.scores, seconds: t.seconds })
      }
      json(res, 404, { error: 'no such route' })
    })().catch((e) => json(res, 500, { error: String(e) }))
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    jobIds: () => [...jobs.keys()],
    close: () => new Promise<void>((r) => { for (const j of jobs.values()) if (j.timer) clearTimeout(j.timer); server.close(() => r()) }),
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
