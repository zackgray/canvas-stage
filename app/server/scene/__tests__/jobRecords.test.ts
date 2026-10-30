// The per-scene record of paid jobs, in front of a stand-in paid route (no Comfy, nothing billed): written `running` before the route
// sees the request, rewritten `done` with the route's own reply even when the page has gone away mid-job (M1), one send per job id,
// only paid routes, only known scenes, and a finished job claimed once.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { JOB_HEADERS } from '../../../src/shared/libraryContract.ts'
import { captureJobs, JobRecords } from '../jobRecords.ts'
import { SceneLibrary } from '../library.ts'

let pub = '', base = '', close = () => {}, scene = ''
let hits = 0
let release: (() => void) | null = null
const records = () => new JobRecords(pub)

beforeAll(async () => {
  pub = path.join(mkdtempSync(path.join(tmpdir(), 'jobrec-')), 'public')
  scene = (await new SceneLibrary(pub).create('Jobs')).id
  const capture = captureJobs(records())
  // the stand-in paid route: answers only when the test releases it, like a Cloud job that takes minutes
  const route = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== '/__lab/planner/develop') { res.statusCode = 404; return res.end('{}') }
    hits++
    req.resume()
    release = () => { res.statusCode = 200; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ kind: 'develop', brief: { brief: 'A chase.' } })) }
  }
  const server = createServer((req, res) => capture(req, res, () => route(req, res)))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})
afterAll(() => { close(); rmSync(path.dirname(pub), { recursive: true, force: true }) })

const send = (job: string, o: { path?: string; scene?: string; signal?: AbortSignal } = {}) => fetch(`${base}${o.path ?? '/__lab/planner/develop'}`, {
  method: 'POST', signal: o.signal, body: JSON.stringify({ idea: 'x' }),
  headers: { 'content-type': 'application/json', [JOB_HEADERS.scene]: o.scene ?? scene, [JOB_HEADERS.job]: job, [JOB_HEADERS.target]: 'develop', [JOB_HEADERS.price]: '3' },
})
const until = async (f: () => boolean) => { for (let i = 0; i < 200 && !f(); i++) await new Promise((r) => setTimeout(r, 5)) }

describe('paid jobs recorded per scene', () => {
  it('M1: the page goes away mid-job; the route still answers and its reply is kept under the job id, once', async () => {
    const id = 'j-mh1abcde-aaaaaa'
    const gone = new AbortController()
    const sent = send(id, { signal: gone.signal }).catch((e: unknown) => e)
    await until(() => !!release)
    expect(records().read(scene, id)).toMatchObject({ status: 'running', intent: 'develop', target: 'develop', price: 3, route: '/__lab/planner/develop', pid: process.pid })
    gone.abort() // the tab reloads: nobody listens for the reply any more
    expect(await sent).toBeInstanceOf(Error)
    release!()
    await until(() => records().read(scene, id)?.status === 'done')
    expect(records().read(scene, id)).toMatchObject({ status: 'done', reply: { status: 200, body: { kind: 'develop', brief: { brief: 'A chase.' } } } })
    expect(records().list(scene).map((r) => r.id)).toEqual([id])
    // the reloaded page sends the same job again by mistake: refused, the route never sees it, the kept reply untouched
    const again = await send(id)
    expect(again.status).toBe(409)
    expect(hits).toBe(1)
    expect(records().read(scene, id)?.status).toBe('done')
    // the first page to claim the result gets it; the record is gone after
    expect(records().clear(scene, id)).toEqual({ cleared: true })
    expect(records().clear(scene, id)).toEqual({ cleared: false })
    release = null
  })

  it('refuses before the route: a free route sent as a job, an unknown scene, a bad id; a POST without job headers passes untouched', async () => {
    expect((await send('j-mh1abcde-bbbbbb', { path: '/__lab/scene/draft' })).status).toBe(400)
    expect((await send('j-mh1abcde-bbbbbb', { scene: 'sc-20261025090000-none' })).status).toBe(404)
    expect((await send('../../x')).status).toBe(400)
    expect(hits).toBe(1)
    const plain = fetch(`${base}/__lab/planner/develop`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
    await until(() => !!release)
    release!(); expect((await plain).status).toBe(200)
    expect(hits).toBe(2)
    expect(records().list(scene)).toEqual([])
  })

  it('a job whose server process is gone reads lost, and can be cleared; a running one cannot', () => {
    const r = records()
    r.start({ id: 'j-mh1abcde-cccccc', scene, intent: 'master', target: 'loc-x', price: 31, route: '/__lab/bible/master' })
    expect(r.clear(scene, 'j-mh1abcde-cccccc')).toEqual({ cleared: false })
    const f = path.join(pub, 'lab-assets', 'scene', scene, 'jobs', 'j-mh1abcde-dddddd.json')
    writeFileSync(f, JSON.stringify({ id: 'j-mh1abcde-dddddd', scene, intent: 'hero', target: 't', price: 3, route: '/__lab/hero', status: 'running', startedAt: new Date().toISOString(), pid: 2 ** 22 + 12345 }))
    expect(r.read(scene, 'j-mh1abcde-dddddd')?.status).toBe('lost')
    expect(r.clear(scene, 'j-mh1abcde-dddddd')).toEqual({ cleared: true })
  })

  it('time spent waiting its turn does not age a job: only its running time counts toward lost (m-4)', () => {
    const hours = (h: number) => new Date(Date.now() - h * 3_600_000)
    const old = new JobRecords(pub, () => hours(3)) // pressed three hours ago, behind a long queue
    const rec = old.start({ id: 'j-mh1abcde-eeeeee', scene, intent: 'l2r', target: 'take-1', price: 16, route: '/__lab/l2r' })
    old.wait(rec, true)
    expect(records().read(scene, rec.id)?.status).toBe('running') // still waiting: alive
    new JobRecords(pub, () => hours(0.5)).wait(rec, false) // its turn came half an hour ago
    expect(records().read(scene, rec.id)?.status).toBe('running')
    new JobRecords(pub, () => hours(2)).wait(rec, true); new JobRecords(pub, () => hours(2)).wait(rec, false) // ran from two hours ago
    expect(records().read(scene, rec.id)?.status).toBe('lost')
    records().clear(scene, rec.id)
  })
})
