import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTES, shotPaths, startKey, type TakeLockRequest, type TakeRecord } from '../../../src/shared/shotContract.ts'
import { labTakes } from '../plugin.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = ''
let close = () => {}
let pub = ''
const mounts: string[] = []
let clock = Date.parse('2026-10-22T12:00:00.000Z')

beforeAll(async () => {
  pub = mkdtempSync(path.join(tmpdir(), 'takes-'))
  const routes: [string, Handler][] = []
  const plugin = labTakes({}, { publicDir: pub, now: () => new Date((clock += 1000)) }) as { apply: string; configureServer: (s: unknown) => void }
  expect(plugin.apply).toBe('serve')
  plugin.configureServer({ config: {}, middlewares: { use: (p: string, h: Handler) => { mounts.push(p); routes.push([p, h]) } } })
  const server = createServer((req, res) => {
    const hit = routes.find(([p]) => req.url === p || req.url!.startsWith(p + '/') || req.url!.startsWith(p + '?'))
    if (!hit) { res.statusCode = 404; return res.end() }
    req.url = req.url!.slice(hit[0].length) || '/'
    hit[1](req, res, () => { res.statusCode = 404; res.end() })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})
afterAll(() => { close(); rmSync(pub, { recursive: true, force: true }) })

const sample = (t: number, x = 0) => ({ t, position: [x, 1.6, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 35, focus: 3 })
const lockBody = (over: Partial<TakeLockRequest> = {}): TakeLockRequest => ({
  worldId: 'loc-a', packId: 'pack-a', fps: 24, frames: 97, samples: Array.from({ length: 121 }, (_, i) => sample(i / 30, i * 0.01)),
  focal: 35, viewAspect: 16 / 9, perfStart: 0, timelineStart: 0, ...over,
})
const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${ROUTES.takes}/lock`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })

describe('takes routes', () => {
  it('lists nothing before the first lock', async () => {
    expect(mounts).toEqual(['/lab-assets/shots', ROUTES.takes])
    const r = await fetch(`${base}${ROUTES.takes}`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ takes: [] })
  })

  let first: TakeRecord
  it('locks a take: the server stamps id, startKey (the contract function) and dates, and writes take.json at shotPaths', async () => {
    const r = await post(lockBody())
    expect(r.status).toBe(201)
    const { take, reused } = await r.json() as { take: TakeRecord; reused: boolean }
    first = take
    expect(reused).toBe(false)
    expect(take.id).toMatch(/^take-2026-10-22T12-00-01-000$/)
    expect(take.startKey).toBe(startKey(sample(0), 35, 0))
    expect(take.lockedAt).toBe('2026-10-22T12:00:01.000Z')
    expect(take.createdAt).toBe(take.lockedAt)
    const file = path.join(pub, shotPaths(take.id).take)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(take)
  })

  it('re-locking an identical take returns the existing record; a changed one gets a new id', async () => {
    const again = await post(lockBody())
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ take: first, reused: true })
    const moved = await post(lockBody({ samples: lockBody().samples.map((s, i) => (i === 60 ? { ...s, focal: 37 } : s)) }))
    expect(moved.status).toBe(201)
    const second = (await moved.json() as { take: TakeRecord }).take
    expect(second.id).not.toBe(first.id)
    expect(second.startKey).toBe(first.startKey) // same opening, different move: a different take with the same start
    const list = (await (await fetch(`${base}${ROUTES.takes}`)).json() as { takes: TakeRecord[] }).takes
    expect(list.map((t) => t.id)).toEqual([second.id, first.id])
  })

  it('refuses takes it cannot use (400), foreign pages (403) and non-JSON bodies (415)', async () => {
    for (const bad of [lockBody({ frames: 96 }), lockBody({ frames: 201 }), lockBody({ samples: [] }), lockBody({ focal: 0 }), lockBody({ perfStart: 1.5 }),
      { ...lockBody(), fps: 30 }, lockBody({ packId: '../x' }), lockBody({ samples: [sample(1), sample(0)] })]) {
      expect((await post(bad)).status).toBe(400)
    }
    expect((await post('{nope')).status).toBe(400)
    expect((await post(lockBody(), { origin: 'http://evil.example' })).status).toBe(403)
    expect((await fetch(`${base}${ROUTES.takes}/lock`, { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } })).status).toBe(415)
    expect((await fetch(`${base}${ROUTES.takes}/nope`)).status).toBe(404)
  })

  it('strips fields the page did not mean to send, and lists only real take folders', async () => {
    const r = await post({ ...lockBody({ perfStart: 3 }), id: 'take-forged', startKey: 'deadbeef', extra: 1 })
    const { take } = await r.json() as { take: TakeRecord & { extra?: number } }
    expect(take.id).not.toBe('take-forged')
    expect(take.startKey).toBe(startKey(sample(0), 35, 3))
    expect(take.extra).toBeUndefined()
    expect(existsSync(path.join(pub, shotPaths('take-forged').root))).toBe(false)
  })
})

describe('discard (QA m13)', () => {
  const discard = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${ROUTES.takes}/discard`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })

  it('a discarded take leaves the list but its folder (the paid files) is kept under _discarded; re-locking it is a new take', async () => {
    const r = await post(lockBody({ perfStart: 7 }))
    const { take } = await r.json() as { take: TakeRecord }
    const keep = path.join(pub, shotPaths(take.id).root, 'hero', 'still.png')
    mkdirSync(path.dirname(keep), { recursive: true }); writeFileSync(keep, 'paid')
    const gone = await discard({ takeId: take.id })
    expect(gone.status).toBe(200)
    expect(await gone.json()).toEqual({ id: take.id, kept: `lab-assets/shots/_discarded/${take.id}` })
    const list = (await (await fetch(`${base}${ROUTES.takes}`)).json() as { takes: TakeRecord[] }).takes
    expect(list.map((t) => t.id)).not.toContain(take.id)
    expect(existsSync(path.join(pub, shotPaths(take.id).root))).toBe(false)
    expect(readFileSync(path.join(pub, 'lab-assets', 'shots', '_discarded', take.id, 'hero', 'still.png'), 'utf8')).toBe('paid')
    const again = await post(lockBody({ perfStart: 7 }))
    expect(again.status).toBe(201)
  })
  it('refuses while a paid still or render of the take runs (409): its result would land in a folder that moved', async () => {
    const { JobRecords } = await import('../../scene/jobRecords.ts')
    const { take } = await (await post(lockBody({ perfStart: 9 }))).json() as { take: TakeRecord }
    const records = new JobRecords(pub)
    const rec = records.start({ id: 'j-mh0abc12-render', scene: 'sc-20261025120000-tttt', intent: 'l2r', target: take.id, price: 30, route: ROUTES.l2r })
    const busy = await discard({ takeId: take.id })
    expect(busy.status).toBe(409)
    expect((await busy.json() as { error: string }).error).toMatch(/still running/)
    expect(existsSync(path.join(pub, shotPaths(take.id).root))).toBe(true)
    records.finish(rec, 200, '{}') // landed: now it can go
    expect((await discard({ takeId: take.id })).status).toBe(200)
  })
  it('refuses unknown takes (404), bad ids (400), non-JSON (400) and foreign pages (403)', async () => {
    expect((await discard({ takeId: 'take-nope' })).status).toBe(404)
    expect((await discard({ takeId: '../x' })).status).toBe(400)
    expect((await discard({})).status).toBe(400)
    expect((await discard('{nope')).status).toBe(400)
    expect((await discard({ takeId: 'take-nope' }, { origin: 'http://evil.example' })).status).toBe(403)
  })
})

describe('discard and the scene library (QA m13)', () => {
  it("a scene's take count and stage no longer include a discarded take", async () => {
    const { viewOf } = await import('../../scene/librarySummary.ts')
    const r = await post(lockBody({ worldId: 'loc-scene', perfStart: 9 }))
    const { take } = await r.json() as { take: TakeRecord }
    const doc = { id: 'scene-x', name: 'x', worlds: [{ id: 'loc-scene' }], worldId: 'loc-scene', hidden: false, revision: 1, updatedAt: '2026-10-22T00:00:00.000Z' } as unknown as Parameters<typeof viewOf>[1]
    expect(viewOf(pub, doc).facts.takes).toEqual({ 'loc-scene': 1 })
    expect(viewOf(pub, doc).summary.stage).toBe('shoot')
    await fetch(`${base}${ROUTES.takes}/discard`, { method: 'POST', body: JSON.stringify({ takeId: take.id }), headers: { 'content-type': 'application/json' } })
    expect(viewOf(pub, doc).facts.takes).toEqual({ 'loc-scene': 0 })
    expect(viewOf(pub, doc).summary.stage).toBe('set')
  })
})
