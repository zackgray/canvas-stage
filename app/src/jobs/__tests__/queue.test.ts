// Paid jobs across scenes queue instead of refusing (fix wave 2026-10-24 #1). The real job capture, library routes, runner (fake
// Cloud, temp ledger) and section guard over HTTP; stand-in paid routes; nothing reaches Cloud. Scene A's draw holds the runner;
// scene B's press is accepted, recorded "waiting" (said as waiting, with nothing of A's), and runs by itself when A's ends. The
// budget is checked when B's turn comes. The same press twice is still refused, and a call without a scene job keeps its refusal.
// A press whose page goes away while it waits (tab closed, reload: its request aborted) is dropped, free; one already submitted is not.
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { BusyError, exclusive, JobError, runJob, type JobRuntime } from '../../../server/jobs/index.ts'
import { fakeJob, gate, rig, type Rig } from '../../../server/jobs/__tests__/rig.ts'
import { LEFT_BEFORE_TURN } from '../../../server/jobs/context.ts'
import { ALREADY_RUNNING, captureJobs } from '../../../server/scene/jobRecords.ts'
import { handleLibrary, libraryCtx, type LibraryCtx } from '../../../server/scene/libraryPlugin.ts'
import { libraryApi } from '../../library/api'
import { isWaiting, jobFetch, SceneJobs, WAITING } from '../sceneJobs'

let pub = '', base = '', close = () => {}, A = '', B = ''
let ctx: LibraryCtx
let r: Rig
const DRAW = { key: 'test-concepts', match: (l: string) => l.startsWith('concept ') }
const OTHER = { key: 'test-hero', match: (l: string) => l.startsWith('hero ') }

/** a stand-in paid route the way the real ones are built: its body read, then its section's guard, then the runner */
function paidRoute(rt: () => JobRuntime, section: typeof DRAW, others: typeof DRAW[] = []) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    let raw = ''; for await (const c of req) raw += c
    const { label } = JSON.parse(raw) as { label: string }
    const send = (status: number, b: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)) }
    try {
      const out = await exclusive(section.key, label, rt().store, section.match, () => runJob(rt(), r.spec({ label })), others)
      send(200, { jobId: out.jobId })
    } catch (e) { send(e instanceof BusyError ? 409 : e instanceof JobError ? e.status : 500, { error: (e as Error).message }) }
  }
}

beforeAll(async () => {
  pub = path.join(mkdtempSync(path.join(tmpdir(), 'queue-')), 'public')
  ctx = libraryCtx({ publicDir: pub })
  A = (await ctx.library.create('Lighthouse')).id
  B = (await ctx.library.create('Night market')).id
  const capture = captureJobs(ctx.jobs)
  const concepts = paidRoute(() => r.rt, DRAW, [OTHER])
  const hero = paidRoute(() => r.rt, OTHER, [DRAW])
  const render = paidRoute(() => r.rt, { key: 'test-l2r', match: (l: string) => l.startsWith('l2r ') }) // no others: waits on the runner's lock
  // a kit still's shape: one press of the hero section, two billed jobs (the draw, then the finish)
  const twoJobs = async (req: IncomingMessage, res: ServerResponse) => {
    for await (const _ of req) { /* body unused */ }
    const out = await exclusive(OTHER.key, 'kit still', r.rt.store, OTHER.match, async () => {
      await runJob(r.rt, r.spec({ label: 'hero A draw' }))
      return runJob(r.rt, r.spec({ label: 'hero A finish' }))
    }, [DRAW])
    res.statusCode = 200; res.end(JSON.stringify({ jobId: out.jobId }))
  }
  const route = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, 'http://x')
    if (url.pathname.startsWith('/__lab/scenes')) {
      let raw = ''; for await (const c of req) raw += c
      const out = await handleLibrary(ctx, req.method!, url.pathname.split('/').filter(Boolean).slice(2), url.searchParams, raw ? JSON.parse(raw) : null)
      res.statusCode = out.status; res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(out.body))
    }
    if (url.pathname === '/__lab/scene/concepts') return concepts(req, res)
    if (url.pathname === '/__lab/hero') return hero(req, res)
    if (url.pathname === '/__lab/l2r') return render(req, res)
    if (url.pathname === '/__lab/hero/finish') return twoJobs(req, res)
    res.statusCode = 404; res.end('{}')
  }
  const server = createServer((req, res) => capture(req, res, () => void route(req, res)))
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
  const real = globalThis.fetch
  vi.stubGlobal('fetch', (u: string, i?: RequestInit) => real(u.startsWith('/') ? `${base}${u}` : u, i))
})
afterAll(() => { vi.unstubAllGlobals(); close(); rmSync(path.dirname(pub), { recursive: true, force: true }) })
afterEach(() => { for (const s of [A, B]) for (const j of ctx.jobs.list(s)) ctx.jobs.clear(s, j.id) })

const until = async (f: () => boolean | Promise<boolean>) => { for (let i = 0; i < 150 && !(await f()); i++) await new Promise((ok) => setTimeout(ok, 10)) }
const store = (scene: string) => new SceneJobs(scene, { api: libraryApi((u, i) => fetch(u, i)), storage: null })
const post = (url: string, label: string, signal?: AbortSignal) =>
  jobFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }), signal })
const answer = async (res: Response) => ({ status: res.status, body: await res.json() as { jobId?: string; error?: string } })

describe("another scene's paid job queues this scene's press instead of refusing it", () => {
  it("scene B's tile while scene A's tile draws: accepted, waiting (no ids of A), then drawn by itself once A's ends", async () => {
    const g = gate()
    r = rig({ jobs: [fakeJob({ id: 'aaaaaaaa-0000-4000-8000-00000000000a', wait: g.wait }), fakeJob({ id: 'bbbbbbbb-0000-4000-8000-00000000000b' })] })
    const a = store(A), b = store(B)
    const first = a.run({ intent: 'concept', target: 'tile:p1', price: 2 }, () => post('/__lab/scene/concepts', 'concept A p1'))
    await until(() => r.submits === 1)
    const second = b.run({ intent: 'concept', target: 'tile:p1', price: 2 }, () => post('/__lab/scene/concepts', 'concept B p1'))
    // B's own record says it waits its turn; B's page sees it as waiting, and nothing of A's
    await until(async () => { await b.sync(); return isWaiting(b.running('concept', 'tile:p1')) })
    expect(ctx.jobs.list(B)).toMatchObject([{ intent: 'concept', target: 'tile:p1', status: 'running', waiting: true }])
    expect(b.snapshot().jobs).toHaveLength(1)
    expect(JSON.stringify(b.snapshot().jobs)).not.toContain(A)
    expect(r.submits).toBe(1) // nothing of B's submitted while A's runs
    expect(WAITING).toBe('Queued. Nothing is spent until it starts.')

    g.open()
    expect(await answer(await first)).toMatchObject({ status: 200 })
    expect(await answer(await second)).toEqual({ status: 200, body: { jobId: 'bbbbbbbb-0000-4000-8000-00000000000b' } })
    expect(r.submits).toBe(2)
    expect(b.running('concept')).toBeNull()
  })

  it('a press of another kind (a hero still beside a concept draw) queues on the runner too, and says so', async () => {
    const g = gate()
    r = rig({ jobs: [fakeJob({ id: 'aaaaaaaa-0000-4000-8000-00000000001a', wait: g.wait })] })
    const held = store(A).run({ intent: 'concept', target: 'tile:p2', price: 2 }, () => post('/__lab/scene/concepts', 'concept A p2'))
    await until(() => r.submits === 1)
    const b = store(B)
    const hero = b.run({ intent: 'hero', target: 'take-9', price: 21 }, () => post('/__lab/hero', 'hero B take-9'))
    await until(async () => { await b.sync(); return isWaiting(b.running('hero', 'take-9')) })
    g.open(); await held
    expect((await answer(await hero)).status).toBe(200)
    expect(r.submits).toBe(2)
  })

  it("a queued job never slips between the two billed jobs of another scene's kit still (m-2)", async () => {
    const draw = gate(), finish = gate()
    r = rig({ jobs: [fakeJob({ id: 'aaaaaaaa-0000-4000-8000-00000000006a', wait: draw.wait }),
      fakeJob({ id: 'aaaaaaaa-0000-4000-8000-00000000006b', wait: finish.wait }), fakeJob({ id: 'bbbbbbbb-0000-4000-8000-00000000006c' })] })
    const kit = store(A).run({ intent: 'heroFinish', target: 'take-6', price: 21 }, () => post('/__lab/hero/finish', 'kit A'))
    await until(() => r.submits === 1)
    const queued = store(B).run({ intent: 'concept', target: 'tile:p8', price: 2 }, () => post('/__lab/scene/concepts', 'concept B p8'))
    await until(() => ctx.jobs.list(B).some((j) => j.waiting))
    draw.open()
    await until(() => r.submits === 2)
    finish.open()
    expect(await answer(await kit)).toEqual({ status: 200, body: { jobId: 'aaaaaaaa-0000-4000-8000-00000000006b' } }) // A's finish was the 2nd job
    expect(await answer(await queued)).toEqual({ status: 200, body: { jobId: 'bbbbbbbb-0000-4000-8000-00000000006c' } })
  })

  it('the day budget is checked when the queued job starts: refused then, plainly, and nothing of it billed', async () => {
    const g = gate()
    r = rig({ cap: 30, jobs: [fakeJob({ id: 'aaaaaaaa-0000-4000-8000-00000000002a', wait: g.wait })] }) // each job is estimated at 20
    const held = store(A).run({ intent: 'concept', target: 'tile:p3', price: 20 }, () => post('/__lab/scene/concepts', 'concept A p3'))
    await until(() => r.submits === 1)
    const queued = store(B).run({ intent: 'concept', target: 'tile:p3', price: 20 }, () => post('/__lab/scene/concepts', 'concept B p3'))
    await until(() => ctx.jobs.list(B).some((j) => (j as { waiting?: boolean }).waiting))
    g.open(); await held
    const out = await answer(await queued)
    expect(out.status).toBe(429)
    expect(out.body.error).not.toMatch(/another paid job/)
    expect(r.submits).toBe(1)
  })

  it('the same press twice is still refused (another tab of the same scene), and a call with no scene job keeps its refusal', async () => {
    const g = gate()
    r = rig({ jobs: [fakeJob({ id: 'aaaaaaaa-0000-4000-8000-00000000003a', wait: g.wait })] })
    const held = store(A).run({ intent: 'concept', target: 'tile:p4', price: 2 }, () => post('/__lab/scene/concepts', 'concept A p4'))
    await until(() => r.submits === 1)
    const tab = store(A) // a second tab: its own store, nothing synced yet
    const twice = await answer(await tab.run({ intent: 'concept', target: 'tile:p4', price: 2 }, () => post('/__lab/scene/concepts', 'concept A p4')))
    expect(twice).toEqual({ status: 409, body: { error: ALREADY_RUNNING } })
    expect(ctx.jobs.list(A)).toHaveLength(1) // no record of the refused one
    // a script or test without the job headers: the section's own refusal, as before
    const bare = await answer(await fetch('/__lab/hero', { method: 'POST', body: JSON.stringify({ label: 'hero x take-1' }) }))
    expect(bare.status).toBe(409)
    expect(bare.body.error).toMatch(/another paid job is running/)
    g.open(); await held
    expect(r.submits).toBe(1)
  })
})

describe('a waiting press whose page went away is dropped before it spends', () => {
  const doneReply = (scene: string) => ctx.jobs.list(scene).find((j) => j.status === 'done')?.reply

  for (const [what, url, label] of [['its section', '/__lab/scene/concepts', 'concept B p6'], ["the runner's lock", '/__lab/l2r', 'l2r B take-6']] as const) {
    it(`closed while it waits for ${what}: refused free, nothing submitted, its record done with the refusal`, async () => {
      const g = gate()
      r = rig({ jobs: [fakeJob({ id: 'aaaaaaaa-0000-4000-8000-00000000004a', wait: g.wait }), fakeJob({ id: 'bbbbbbbb-0000-4000-8000-00000000004b' })] })
      const held = store(A).run({ intent: 'concept', target: 'tile:p6', price: 2 }, () => post('/__lab/scene/concepts', 'concept A p6'))
      await until(() => r.submits === 1)
      const tab = new AbortController()
      const intent = url === '/__lab/l2r' ? 'l2r' : 'concept'
      const left = store(B).run({ intent, target: 'tile:p6', price: 16 }, () => post(url, label, tab.signal))
      left.catch(() => {})
      await until(() => ctx.jobs.list(B).some((j) => j.waiting))
      tab.abort() // the tab closes
      await new Promise((ok) => setTimeout(ok, 50))
      g.open(); await held // A's turn ends: B's comes, and finds its page gone
      await until(() => !!doneReply(B))
      expect(doneReply(B)).toEqual({ status: 409, body: { error: LEFT_BEFORE_TURN } })
      expect(r.submits).toBe(1) // A's only: B was never sent
    })
  }

  it('a press already submitted keeps running when its page goes away, and its result is kept', async () => {
    const g = gate()
    r = rig({ jobs: [fakeJob({ id: 'aaaaaaaa-0000-4000-8000-00000000005a', wait: g.wait })] })
    const tab = new AbortController()
    const sent = store(A).run({ intent: 'concept', target: 'tile:p7', price: 2 }, () => post('/__lab/scene/concepts', 'concept A p7', tab.signal))
    sent.catch(() => {})
    await until(() => r.submits === 1)
    tab.abort()
    g.open()
    await until(() => !!doneReply(A))
    expect(doneReply(A)).toEqual({ status: 200, body: { jobId: 'aaaaaaaa-0000-4000-8000-00000000005a' } })
  })
})
