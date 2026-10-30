// Recipe wave 3, track CARRY: the lock route keeps the page's frame-0 key and, on a new take with an unchanged frame 0, carries the
// previous take's approved opening still over (said as `carried`).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTES, shotPaths, type HeroStill, type TakeLockRequest, type TakeLockResponse } from '../../../src/shared/shotContract.ts'
import { labTakes } from '../plugin.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = '', pub = ''
let close = () => {}
let clock = Date.parse('2026-10-24T12:00:00.000Z')

beforeAll(async () => {
  pub = mkdtempSync(path.join(tmpdir(), 'takes-carry-'))
  const routes: [string, Handler][] = []
  const plugin = labTakes({}, { publicDir: pub, now: () => new Date((clock += 1000)) }) as { configureServer: (s: unknown) => void }
  plugin.configureServer({ config: {}, middlewares: { use: (p: string, h: Handler) => { routes.push([p, h]) } } })
  const server = createServer((req, res) => {
    const hit = routes.find(([p]) => req.url === p || req.url!.startsWith(p + '/'))
    if (!hit) { res.statusCode = 404; return res.end() }
    req.url = req.url!.slice(hit[0].length) || '/'
    hit[1](req, res, () => { res.statusCode = 404; res.end() })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})
afterAll(() => { close(); rmSync(pub, { recursive: true, force: true }) })

const sample = (t: number) => ({ t, position: [0, 1.6, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 50, focus: 3 })
const body = (over: Partial<TakeLockRequest> = {}): TakeLockRequest => ({
  worldId: 'loc-a', packId: 'mocap-aaaa', fps: 24, frames: 9, samples: Array.from({ length: 12 }, (_, i) => sample(i / 24)),
  focal: 50, viewAspect: 16 / 9, perfStart: 0, timelineStart: 0, ...over,
})
const lock = async (q: unknown) => {
  const r = await fetch(`${base}${ROUTES.takes}/lock`, { method: 'POST', body: JSON.stringify(q), headers: { 'content-type': 'application/json' } })
  return { status: r.status, body: await r.json() as TakeLockResponse & { error?: string } }
}
function approve(takeId: string, startKey: string, id = 'hero-open') {
  const dir = path.join(pub, shotPaths(takeId).hero)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${id}.png`), 'png')
  const s: HeroStill = { id, takeId, startKey, png: '', seed: 1, jobId: 'j', credits: 21, approved: true, createdAt: '2026-10-24T11:00:00Z' }
  writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(s))
}

describe('lock with a frame-0 key', () => {
  it('keeps the key on the record; a new take with the same frame 0 (an extra\'s mid-path moved) inherits the approved opening still', async () => {
    const a = await lock({ ...body(), frame0Key: '12345678' })
    expect(a.status).toBe(201)
    expect(a.body.take.frame0Key).toBe('12345678')
    expect(a.body.carried).toBeUndefined()
    approve(a.body.take.id, a.body.take.startKey)
    // the extra's later path changed: a new pack id (new take), frame 0 the same
    const b = await lock({ ...body({ packId: 'mocap-bbbb' }), frame0Key: '12345678' })
    expect(b.status).toBe(201)
    expect(b.body.take.id).not.toBe(a.body.take.id)
    expect(b.body.carried).toEqual({ stillId: 'hero-open', from: a.body.take.id })
    const r = await fetch(`${base}/lab-assets/shots/${b.body.take.id}/hero/hero-open.json`)
    expect(((await r.json()) as HeroStill)).toMatchObject({ takeId: b.body.take.id, carriedFrom: a.body.take.id, approved: true })
    // the same request again is the same take: nothing carried twice
    const again = await lock({ ...body({ packId: 'mocap-bbbb' }), frame0Key: '12345678' })
    expect([again.status, again.body.take.id, again.body.carried]).toEqual([200, b.body.take.id, undefined])
  })

  it('a moved start (another frame-0 key) carries nothing', async () => {
    const c = await lock({ ...body({ packId: 'mocap-cccc' }), frame0Key: '87654321' })
    expect(c.status).toBe(201)
    expect(c.body.carried).toBeUndefined()
  })

  it('without a key (a pack world, an older page) it locks as before and carries nothing', async () => {
    const d = await lock(body({ packId: 'mocap-dddd' }))
    expect(d.status).toBe(201)
    expect(d.body.take.frame0Key).toBeUndefined()
    expect(d.body.carried).toBeUndefined()
  })

  it('the same request with another frame-0 key (a set piece moved) is another take', async () => {
    const e1 = await lock({ ...body({ packId: 'mocap-eeee' }), frame0Key: 'aaaaaaaa' })
    const e2 = await lock({ ...body({ packId: 'mocap-eeee' }), frame0Key: 'bbbbbbbb' })
    expect(e2.status).toBe(201)
    expect(e2.body.take.id).not.toBe(e1.body.take.id)
  })

  it('refuses a malformed key', async () => {
    expect((await lock({ ...body(), frame0Key: '../x' })).status).toBe(400)
    expect((await lock({ ...body(), frame0Key: 12 })).status).toBe(400)
  })
})
