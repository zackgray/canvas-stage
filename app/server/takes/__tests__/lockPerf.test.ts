// Lock take stores the take's own performance (PLAN-PER-TAKE-PERFORMANCE.md §2, WP1) through the real route: the performer the page
// sends is kept when it hashes to the packId, refused (409, nothing written) when it does not; an older page that sends none gets the
// scene's file when it matches, else no copy. The list GET adopts. Every other writer of take.json keeps the copy. Temp folders only.
import { readdirSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PERF_MISMATCH, ROUTES, SHOTS_DIR, type TakeLockRequest, type TakeRecord } from '../../../src/shared/shotContract.ts'
import { mocapPackId } from '../../../src/stage3d/planHash.ts'
import { restampSetKey } from '../../clay/setRestamp.ts'
import { labTakes } from '../plugin.ts'
import { renameTake, setTakeWords, wordsFromScene } from '../words.ts'
import { kitWorld, onDisk, putTake, tempPub, walk } from './takePerfFixture.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
const pub = tempPub('lock')
let base = '', close = () => {}, clock = Date.parse('2026-10-29T12:00:00.000Z')

beforeAll(async () => {
  const routes: [string, Handler][] = []
  const plugin = labTakes({}, { publicDir: pub, now: () => new Date((clock += 1000)) }) as { configureServer: (s: unknown) => void }
  plugin.configureServer({ config: {}, middlewares: { use: (p: string, h: Handler) => { routes.push([p, h]) } } })
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

const w = kitWorld(pub, walk(0, 'card-a'))
let x = 0
const body = (over: Partial<TakeLockRequest> = {}): TakeLockRequest => ({
  worldId: w.id, packId: w.packId, fps: 24, frames: 97, samples: [{ t: 0, position: [x++, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35 }],
  focal: 35, viewAspect: 16 / 9, perfStart: 0, timelineStart: 0, ...over,
})
const lock = async (b: unknown) => {
  const r = await fetch(`${base}${ROUTES.takes}/lock`, { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } })
  return { status: r.status, json: await r.json() as { take: TakeRecord; reused?: boolean; error?: string } }
}
const takeCount = () => { try { return readdirSync(path.join(pub, SHOTS_DIR)).length } catch { return 0 } }

describe('Lock take stores the performance', () => {
  it('stores the performer the page sends when it hashes to the packId (perfFrom lock)', async () => {
    const r = await lock(body({ perf: w.perf }))
    expect(r.status).toBe(201)
    expect(r.json.take.perf).toEqual(w.perf)
    expect(r.json.take.perfFrom).toBe('lock')
    expect(onDisk(pub, r.json.take.id)).toEqual(r.json.take)
    expect(mocapPackId(r.json.take.perf!)).toBe(r.json.take.packId)
  })

  it('refuses a performer that is not the packId walk (409, plain words) and writes nothing', async () => {
    const n = takeCount()
    const r = await lock(body({ perf: walk(4) }))
    expect(r.status).toBe(409)
    expect(r.json.error).toBe(PERF_MISMATCH)
    expect(takeCount()).toBe(n)
  })

  it('refuses a performer that does not parse, or one sent with a take that has no 3D performer (400)', async () => {
    expect((await lock(body({ perf: { path: 'nope' } as never }))).status).toBe(400)
    expect((await lock(body({ packId: 'pack-a', perf: w.perf }))).status).toBe(400)
  })

  it('an older page that sends no perf: the scene file is copied when it hashes to the packId, else no copy', async () => {
    const r = await lock(body())
    expect(r.status).toBe(201)
    expect(r.json.take.perf).toEqual(w.perf)
    const other = await lock(body({ packId: 'mocap-00000000' }))
    expect(other.status).toBe(201)
    expect(other.json.take.perf).toBeUndefined()
    const lifted = await lock(body({ packId: null }))
    expect(lifted.json.take.perf).toBeUndefined()
  })

  it('re-locking an identical take with no copy gives it the copy; one that has a copy keeps its own', async () => {
    const plain = body({ packId: 'mocap-00000000' })
    const first = await lock(plain)
    expect(first.json.take.perf).toBeUndefined()
    const bare = putTake(pub, { worldId: w.id, packId: w.packId, samples: [{ t: 0, position: [99, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35 }], timelineStart: 0 })
    const { id: _i, startKey: _s, lockedAt: _l, createdAt: _c, ...req } = bare // eslint-disable-line @typescript-eslint/no-unused-vars
    const again = await lock({ ...req, perf: w.perf })
    expect(again.json.reused).toBe(true)
    expect(again.json.take.id).toBe(bare.id)
    expect(onDisk(pub, bare.id).perf).toEqual(w.perf)
    const kept = putTake(pub, { worldId: w.id, packId: w.packId, perf: { ...w.perf, castId: 'card-then' }, perfFrom: 'lock', samples: [{ t: 0, position: [98, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35 }], timelineStart: 0 })
    const { id: _j, startKey: _t, lockedAt: _m, createdAt: _d, perf: _p, perfFrom: _f, ...req2 } = kept // eslint-disable-line @typescript-eslint/no-unused-vars
    await lock({ ...req2, perf: w.perf })
    expect(onDisk(pub, kept.id)).toEqual(kept)
  })

  it('the takes list GET adopts first: a take on the scene walk with no copy comes back holding one', async () => {
    const t = putTake(pub, { worldId: w.id, packId: w.packId })
    const r = await fetch(`${base}${ROUTES.takes}`)
    const listed = (await r.json() as { takes: TakeRecord[] }).takes.find((k) => k.id === t.id)!
    expect(listed.perf).toEqual(w.perf)
    expect(listed.perfFrom).toBe('adopted')
  })
})

describe('every other writer of take.json keeps the copy', () => {
  it('words, words from scene, rename and the set-key restamp spread the record', () => {
    const t = putTake(pub, { worldId: w.id, packId: w.packId, perf: w.perf, perfFrom: 'lock', setKey: '00000000' })
    setTakeWords(pub, t.id, 'A walk up the lane.')
    expect(onDisk(pub, t.id).perf).toEqual(w.perf)
    wordsFromScene(pub, t.id)
    renameTake(pub, t.id, 'Walk-up')
    renameTake(pub, t.id, '')
    expect(restampSetKey(pub, onDisk(pub, t.id))).not.toBeNull()
    const after = onDisk(pub, t.id)
    expect([after.perf, after.perfFrom, after.setKey === '00000000']).toEqual([w.perf, 'lock', false])
  })
})
