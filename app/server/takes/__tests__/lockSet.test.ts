// Lock take stores the take's own set (PLAN-PER-TAKE-SET.md, S1) through the real route: the plan the page sends is kept when it
// hashes to the setKey, refused (409 SET_MISMATCH, nothing written) when it does not; an older page that sends none gets the scene's
// plan.json when its key is the setKey, else no copy. A reused take keeps the copy it has. Every other writer of take.json keeps
// the copy. Temp folders only.
import { readdirSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTES, SHOTS_DIR, type TakeLockRequest, type TakeRecord } from '../../../src/shared/shotContract.ts'
import { SET_MISMATCH, SET_WITHOUT_KEY } from '../../../src/shared/takeSetContract.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { mocapPackId } from '../../../src/stage3d/planHash.ts'
import { restampSetKey } from '../../clay/setRestamp.ts'
import { adoptPerfInto } from '../adopt.ts'
import { labTakes } from '../plugin.ts'
import { lockTake } from '../store.ts'
import { renameTake, setTakeWords, wordsFromScene } from '../words.ts'
import { onDisk, putTake, tempPub, walk } from './takePerfFixture.ts'
import { setPlan, setWorld } from './takeSetFixture.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
const pub = tempPub('lockset')
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

const w = setWorld(pub)
w.store.saveSky(w.id, { look: 'dusk' }, new Date('2026-10-29T11:00:00.000Z')) // the set has changed once: setSince is that stamp
const SINCE = '2026-10-29T11:00:00.000Z'
let x = 0
const body = (over: Partial<TakeLockRequest> & { set?: unknown } = {}) => ({
  worldId: w.id, packId: null, fps: 24, frames: 97, samples: [{ t: 0, position: [x++, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35 }],
  focal: 35, viewAspect: 16 / 9, perfStart: 0, timelineStart: 0, setKey: w.key(), ...over,
})
const lock = async (b: unknown) => {
  const r = await fetch(`${base}${ROUTES.takes}/lock`, { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } })
  return { status: r.status, json: await r.json() as { take: TakeRecord; reused?: boolean; error?: string } }
}
const takeCount = () => { try { return readdirSync(path.join(pub, SHOTS_DIR)).length } catch { return 0 } }

describe('Lock take stores the set', () => {
  it('stores the plan the page sends when it hashes to the setKey (setFrom lock, setSince the world stamp)', async () => {
    const r = await lock(body({ set: w.plan() }))
    expect(r.status).toBe(201)
    expect(r.json.take).toMatchObject({ set: w.plan(), setFrom: 'lock', setSince: SINCE })
    expect(setKeyOf(r.json.take.set)).toBe(r.json.take.setKey)
    expect(onDisk(pub, r.json.take.id)).toEqual(r.json.take)
  })

  it('refuses a plan that is not the setKey set (409, plain words) and writes nothing', async () => {
    const n = takeCount()
    const r = await lock(body({ set: { ...w.plan(), seed: w.plan().seed + 7 } }))
    expect([r.status, r.json.error]).toEqual([409, SET_MISMATCH])
    expect(takeCount()).toBe(n)
  })

  it('refuses a plan that does not parse, or one sent with no setKey (400), and writes nothing', async () => {
    const n = takeCount()
    expect((await lock(body({ set: { kit: 'nope' } }))).status).toBe(400)
    const { setKey: _k, ...keyless } = body({ set: w.plan() }) // eslint-disable-line @typescript-eslint/no-unused-vars
    const r = await lock(keyless)
    expect([r.status, r.json.error]).toEqual([400, SET_WITHOUT_KEY])
    expect(takeCount()).toBe(n)
  })

  it('an older page that sends no set: the scene plan.json is copied when its key is the setKey, else no copy', async () => {
    const r = await lock(body())
    expect(r.json.take).toMatchObject({ set: w.plan(), setFrom: 'lock', setSince: SINCE })
    const other = await lock(body({ setKey: '00000000' }))
    expect([other.status, other.json.take.set]).toEqual([201, undefined])
    const { setKey: _k, ...keyless } = body() // eslint-disable-line @typescript-eslint/no-unused-vars
    expect((await lock(keyless)).json.take.set).toBeUndefined()
  })

  it('re-locking an identical take with no copy gives it the copy; one that has a copy keeps its own', async () => {
    const bare = putTake(pub, { worldId: w.id, packId: null, setKey: w.key(), samples: [{ t: 0, position: [99, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35 }], timelineStart: 0 })
    const { id: _i, startKey: _s, lockedAt: _l, createdAt: _c, ...req } = bare // eslint-disable-line @typescript-eslint/no-unused-vars
    const again = await lock({ ...req, set: w.plan() })
    expect([again.json.reused, again.json.take.id]).toEqual([true, bare.id])
    expect(onDisk(pub, bare.id)).toMatchObject({ set: w.plan(), setFrom: 'lock' })
    const kept = putTake(pub, { worldId: w.id, packId: null, setKey: w.key(), set: w.plan(), setFrom: 'adopted', setSince: 'then',
      samples: [{ t: 0, position: [98, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35 }], timelineStart: 0 })
    const { id: _j, startKey: _t, lockedAt: _m, createdAt: _d, set: _p, setFrom: _f, setSince: _g, ...req2 } = kept // eslint-disable-line @typescript-eslint/no-unused-vars
    expect((await lock({ ...req2, set: w.plan() })).json.reused).toBe(true)
    expect(onDisk(pub, kept.id)).toEqual(kept)
  })

  it('the takes list GET adopts first: a keyed take on the scene set whose frames are on it comes back holding a copy', async () => {
    const t = putTake(pub, { worldId: w.id, packId: null, setKey: w.key(), lockedAt: '2026-10-29T11:30:00.000Z' })
    const r = await fetch(`${base}${ROUTES.takes}`)
    const listed = (await r.json() as { takes: TakeRecord[] }).takes.find((k) => k.id === t.id)!
    expect(listed).toMatchObject({ set: w.plan(), setFrom: 'adopted', setSince: SINCE })
  })
})

describe('every other writer of take.json keeps the set copy', () => {
  it('words, words from scene, rename, the set-key restamp, perf adoption and a reused lock spread the record', () => {
    const own = { set: setPlan, setFrom: 'lock' as const, setSince: null }
    const t = putTake(pub, { worldId: w.id, packId: mocapPackId(walk(0)), setKey: '00000000', ...own })
    setTakeWords(pub, t.id, 'A walk up the lane.')
    expect(onDisk(pub, t.id)).toMatchObject(own)
    wordsFromScene(pub, t.id)
    renameTake(pub, t.id, 'Walk-up')
    renameTake(pub, t.id, '')
    expect(onDisk(pub, t.id)).toMatchObject(own)
    expect(adoptPerfInto(pub, w.id, walk(0))).toContain(t.id) // perf adoption writes this take: the set rides along
    expect(onDisk(pub, t.id)).toMatchObject({ ...own, perfFrom: 'adopted' })
    const { id: _i, startKey: _s, lockedAt: _l, createdAt: _c, set: _p, setFrom: _f, setSince: _g, perf: _q, perfFrom: _r, prompt: _w, sceneBase: _b, ...req } = onDisk(pub, t.id) // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(lockTake(pub, { ...req, frame0Key: 'abcd0001' } as TakeLockRequest).reused).toBe(true) // the reuse writes the frame-0 key in
    expect(onDisk(pub, t.id)).toMatchObject({ ...own, frame0Key: 'abcd0001' })
    // (S2) this copy does not hash to its key ('00000000'): re-prepare puts the scene's set in with its key, the rest spread whole
    expect(restampSetKey(pub, onDisk(pub, t.id))).toBe(w.key())
    expect(onDisk(pub, t.id)).toMatchObject({ set: w.plan(), setFrom: 'reprepare', setKey: w.key(), frame0Key: 'abcd0001', perfFrom: 'adopted' })
    // a take whose copy matches keeps it and its key: nothing is written
    const before = JSON.stringify(onDisk(pub, t.id))
    expect(restampSetKey(pub, onDisk(pub, t.id), 'ffffffff')).toBeNull()
    expect(JSON.stringify(onDisk(pub, t.id))).toBe(before)
  })
})
