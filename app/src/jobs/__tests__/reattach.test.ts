// The per-scene job store against the real server pieces (the job capture and the library routes, over HTTP, in front of a stand-in
// paid route; no Comfy, nothing billed): a reload mid-job re-attaches from the persisted record and applies the stored reply by id
// without sending again (M1); the job is running for the reloaded page and for a second tab at once (M2); no price, no send (m14).
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { captureJobs } from '../../../server/scene/jobRecords'
import { handleLibrary, libraryCtx } from '../../../server/scene/libraryPlugin'
import { libraryApi } from '../../library/api'
import type { SceneJobRecord } from '../../shared/libraryContract'
import { briefApi } from '../../studio/scene/briefApi'
import { BRIEF } from '../../studio/scene/__tests__/briefFakes'
import { JobDetached, JobRefused, jobFetch, PRICE_LOADING, SceneJobs } from '../sceneJobs'

let pub = '', base = '', close = () => {}, scene = ''
let hits = 0
let release: (() => void) | null = null

beforeAll(async () => {
  pub = path.join(mkdtempSync(path.join(tmpdir(), 'reattach-')), 'public')
  const ctx = libraryCtx({ publicDir: pub })
  scene = (await ctx.library.create('Reattach')).id
  const capture = captureJobs(ctx.jobs)
  const route = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, 'http://x')
    const json = (status: number, b: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)) }
    if (url.pathname.startsWith('/__lab/scenes')) {
      let raw = ''; for await (const c of req) raw += c
      const out = await handleLibrary(ctx, req.method!, url.pathname.split('/').filter(Boolean).slice(2), url.searchParams, raw ? JSON.parse(raw) : null)
      return json(out.status, out.body)
    }
    if (url.pathname === '/__lab/planner/develop') { // the stand-in paid route: a Gemma job that answers when the test says
      hits++; req.resume()
      release = () => json(200, { kind: 'develop', mode: 'full', idea: 'x', brief: BRIEF, runId: 'pl-1', jobIds: ['j1'], credits: 3, createdAt: 't', attempts: 1 })
      return
    }
    json(404, { error: 'no' })
  }
  const server = createServer((req, res) => capture(req, res, () => void route(req, res)))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
  const real = globalThis.fetch
  vi.stubGlobal('fetch', (u: string, i?: RequestInit) => real(u.startsWith('/') ? `${base}${u}` : u, i)) // the page's relative URLs
})
afterAll(() => { vi.unstubAllGlobals(); close(); rmSync(path.dirname(pub), { recursive: true, force: true }) })
afterEach(() => { hits = 0; release = null })

/** a browser's localStorage: what survives a reload of the page */
function storage(): Storage {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: (k) => { m.delete(k) }, clear: () => m.clear(), key: () => null, get length() { return m.size } }
}
const until = async (f: () => boolean | Promise<boolean>) => { for (let i = 0; i < 300 && !(await f()); i++) await new Promise((r) => setTimeout(r, 5)) }
const api = () => libraryApi((u, i) => fetch(u, i))

describe('the job store re-attaches after a reload', () => {
  it('M1 + M2: a Develop sent before a reload is shown running at once, by the reloaded page and by a second tab; its result is applied by id, never sent again', async () => {
    const browser = storage()
    const before = new SceneJobs(scene, { api: api(), storage: browser })
    const pressed = {}
    before.own(pressed, { intents: ['develop'], apply: () => { throw new Error('the page that pressed is gone') } })
    const tab = new AbortController()
    const brief = briefApi(jobFetch, scene)
    const sent = before.run({ intent: 'develop', target: 'develop', price: 3, owner: pressed },
      () => jobFetch('/__lab/planner/develop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea: 'x', mode: 'full' }), signal: tab.signal }))
    await until(() => !!release)
    tab.abort() // the reload: this page's fetch dies with it, the server carries on
    await expect(sent).rejects.toBeInstanceOf(JobDetached)

    // the reloaded page: the job is running before it has asked the server anything (the button is off at first paint)
    const after = new SceneJobs(scene, { api: api(), storage: browser })
    expect(after.running('develop')).toMatchObject({ intent: 'develop', target: 'develop', price: 3 })
    // a second tab, with nothing of its own stored, sees it from the server's record
    const other = new SceneJobs(scene, { api: api(), storage: storage() })
    await other.sync()
    expect(other.running('develop')).toMatchObject({ intent: 'develop' })
    // pressing again on either is refused on this side: nothing goes out
    await expect(after.run({ intent: 'develop', target: 'develop', price: 3 }, () => jobFetch('/__lab/planner/develop', { method: 'POST' }))).rejects.toBeInstanceOf(JobRefused)

    const applied: { job: SceneJobRecord; result: unknown }[] = []
    after.own({}, { intents: ['develop'], parse: brief.parse, apply: async (job, outcome) => { applied.push({ job, result: await outcome }) } })
    release!() // the paid job finishes with nobody listening on the request
    await until(async () => { await after.sync(); return applied.length > 0 })
    expect(applied).toHaveLength(1)
    expect(applied[0].job).toMatchObject({ intent: 'develop', status: 'done' })
    expect((applied[0].result as { brief: unknown }).brief).toEqual(BRIEF) // exactly what the press's own response would have carried
    expect(hits).toBe(1) // one paid POST in all
    expect(after.running('develop')).toBeNull()
    expect(await api().jobs(scene)).toEqual([]) // claimed: the second tab never applies it too
    await other.sync()
    expect(other.snapshot().jobs).toEqual([])
  })

  it('m14: a paid press with no price loaded is refused before anything is sent; the same job twice is sent once', async () => {
    const jobs = new SceneJobs(scene, { api: api(), storage: storage() })
    const call = vi.fn(async () => 'ok')
    await expect(jobs.run({ intent: 'l2r', target: 'take-1', price: null }, call)).rejects.toThrow(PRICE_LOADING)
    await expect(jobs.run({ intent: 'l2r', target: 'take-1', price: undefined }, call)).rejects.toBeInstanceOf(JobRefused)
    expect(call).not.toHaveBeenCalled()
    let done = () => {}
    const slow = vi.fn(() => new Promise<string>((r) => { done = () => r('drawn') }))
    const first = jobs.run({ intent: 'hero', target: 'take-1', price: 3 }, slow)
    await expect(jobs.run({ intent: 'hero', target: 'take-1', price: 3 }, slow)).rejects.toBeInstanceOf(JobRefused)
    done()
    expect(await first).toBe('drawn')
    expect(slow).toHaveBeenCalledTimes(1)
  })
})
