// Tidy wave (STALE): the lock route keeps the page's set key (a hash of the kit set plan), and a lock whose set key differs from an
// otherwise identical take on disk is a new take, never the old record (its frames and stills show the old set).
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTES, type TakeLockRequest, type TakeLockResponse } from '../../../src/shared/shotContract.ts'
import { labTakes } from '../plugin.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = '', pub = ''
let close = () => {}
let clock = Date.parse('2026-10-25T12:00:00.000Z')

beforeAll(async () => {
  pub = mkdtempSync(path.join(tmpdir(), 'takes-setkey-'))
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
  worldId: 'loc-s', packId: 'mocap-aaaa', fps: 24, frames: 9, samples: Array.from({ length: 12 }, (_, i) => sample(i / 24)),
  focal: 50, viewAspect: 16 / 9, perfStart: 0, timelineStart: 0, ...over,
})
const lock = async (q: unknown) => {
  const r = await fetch(`${base}${ROUTES.takes}/lock`, { method: 'POST', body: JSON.stringify(q), headers: { 'content-type': 'application/json' } })
  return { status: r.status, body: await r.json() as TakeLockResponse & { error?: string } }
}

describe('lock with a set key', () => {
  it('is kept on the record; the same set re-locks to the same take; a moved set is a new take', async () => {
    const a = await lock({ ...body(), setKey: 'aaaa0001' })
    expect([a.status, a.body.take.setKey]).toEqual([201, 'aaaa0001'])
    const same = await lock({ ...body(), setKey: 'aaaa0001' })
    expect([same.status, same.body.take.id]).toEqual([200, a.body.take.id])
    // the camera, motion and frame-0 key's absence all equal: only the set differs, and that is another take
    const moved = await lock({ ...body(), setKey: 'aaaa0002' })
    expect(moved.status).toBe(201)
    expect(moved.body.take.id).not.toBe(a.body.take.id)
    expect(moved.body.take.setKey).toBe('aaaa0002')
  })
  it('a lock without one (no kit set, an older page) locks as before, with no set key written', async () => {
    const r = await lock(body({ worldId: 'loc-t' }))
    expect(r.status).toBe(201)
    expect('setKey' in r.body.take).toBe(false)
  })
  it('a set key that is not 8 hex digits is refused', async () => {
    expect((await lock({ ...body(), setKey: '../x' })).status).toBe(400)
    expect((await lock({ ...body(), setKey: 7 })).status).toBe(400)
  })
})
