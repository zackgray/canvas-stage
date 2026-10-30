// Kit worlds on disk through the routes (temp public dir; no real data is read or written): register, meta and manifest shape,
// the refusals (parsePlan's own errors), the still, the performance, and the Stage reading a kit world as a world.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parsePlan } from '../../../src/stage3d/plan.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { readWorld } from '../../../src/shared/worldContract.ts'
import { png } from '../../__tests__/png.ts'
import { KIT_STILL_H, KIT_STILL_W, kitHorizonRow, kitVfovDeg } from '../master.ts'
import { labStage3D, STAGE3D_ROUTE } from '../plugin.ts'
import { standingPerf } from '../store.ts'
import { NEW_WALK } from '../strideFitStamp.ts'
import type { KitWorld } from '../types.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = '', pub = '', close = () => {}
let clock = Date.parse('2026-10-23T03:00:00.000Z')
const loc = () => path.join(pub, 'lab-assets', 'locations')
const manifest = () => JSON.parse(readFileSync(path.join(loc(), 'manifest.json'), 'utf8')) as { shots: Record<string, unknown>[] }

beforeAll(async () => {
  pub = path.join(mkdtempSync(path.join(tmpdir(), 'stage3d-')), 'public')
  let handler: Handler | null = null
  const plugin = labStage3D({}, { publicDir: pub, now: () => new Date((clock += 1000)) }) as unknown as { apply: string; configureServer: (s: unknown) => void }
  expect(plugin.apply).toBe('serve')
  plugin.configureServer({ middlewares: { use: (p: string, h: Handler) => { expect(p).toBe(STAGE3D_ROUTE); handler = h } } })
  const server = createServer((req, res) => {
    if (!req.url!.startsWith(STAGE3D_ROUTE)) { res.statusCode = 404; return res.end() }
    req.url = req.url!.slice(STAGE3D_ROUTE.length) || '/'
    handler!(req, res, () => { res.statusCode = 404; res.end() })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${STAGE3D_ROUTE}`
  close = () => server.close()
})
afterAll(() => { close(); rmSync(path.dirname(pub), { recursive: true, force: true }) })

const post = (route: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${route}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })
const still = (w = KIT_STILL_W, h = KIT_STILL_H) => png(w, h, () => [120, 120, 120])

describe('kit world routes', () => {
  let world: KitWorld
  it('registers a kit world from a plan: a loc- folder with meta.json (world.kind kit), plan.json and the default performance', async () => {
    const r = await post('/world', { plan: BATTLEFIELD, description: 'S-track test world' })
    expect(r.status).toBe(201)
    world = await r.json() as KitWorld
    expect(world.id).toMatch(/^loc-2026-10-23T03-00-01-000$/)
    expect(world).toMatchObject({ description: 'S-track test world', plan: BATTLEFIELD, perf: standingPerf(BATTLEFIELD), still: null }) // standing on the mark: no walk, no costume
    const dir = path.join(loc(), world.id)
    const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8'))
    expect(meta).toMatchObject({
      kind: 'location', id: world.id, width: 1920, height: 1088, lens: { from: 'known' },
      world: { kind: 'kit', eyeHeightM: 1.6, cameraPreset: 'eye', builtAt: null },
      result: { shot: { description: 'S-track test world' } }, kit: { plan: 'plan.json', performance: 'performance.json' },
    })
    expect(meta.lens.vfovDeg).toBeCloseTo(kitVfovDeg(), 9)
    expect(meta.world.horizonRow).toBeCloseTo(kitHorizonRow(), 9)
    expect(readWorld(meta).kind).toBe('kit')
    expect(JSON.parse(readFileSync(path.join(dir, 'plan.json'), 'utf8'))).toEqual(BATTLEFIELD)
    expect(JSON.parse(readFileSync(path.join(dir, 'performance.json'), 'utf8'))).toEqual(standingPerf(BATTLEFIELD))
    // not listed until its still is on disk (the manifest is written last)
    expect(existsSync(path.join(loc(), 'manifest.json'))).toBe(false)
  })

  it('refuses a plan parsePlan refuses, with its own errors, and writes nothing', async () => {
    const bad = { ...BATTLEFIELD, seed: 1.5, kit: [{ kind: 'dragon', at: [0, 0] }] }
    const r = await post('/world', { plan: bad })
    expect(r.status).toBe(422)
    const body = await r.json() as { error: string; errors: string[] }
    const want = parsePlan(bad)
    expect(want.ok).toBe(false)
    expect(body.errors).toEqual(want.ok ? [] : want.errors)
    expect(body.errors.join(' ')).toContain('dragon')
    expect((await (await fetch(`${base}/worlds`)).json()).worlds.map((w: KitWorld) => w.id)).toEqual([world.id])
    expect((await post('/world', { plan: BATTLEFIELD, perf: { path: [[0, 0]] } })).status).toBe(422)
    expect((await post('/world', [1, 2])).status).toBe(400)
  })

  it('takes the 1920 x 1088 master still, then lists the world in the manifest as a kit shot (no depths)', async () => {
    const wrong = await fetch(`${base}/still?id=${world.id}`, { method: 'POST', body: new Uint8Array(still(640, 360)), headers: { 'content-type': 'image/png' } })
    expect(wrong.status).toBe(400)
    expect((await fetch(`${base}/still?id=${world.id}`, { method: 'POST', body: 'not a png' })).status).toBe(400)
    const ok = await fetch(`${base}/still?id=${world.id}`, { method: 'POST', body: new Uint8Array(still()), headers: { 'content-type': 'image/png' } })
    expect(ok.status).toBe(200)
    expect((await ok.json() as KitWorld).still).toBe(`/lab-assets/locations/${world.id}/still.png`)
    const shots = manifest().shots
    expect(shots).toHaveLength(1)
    expect(shots[0]).toMatchObject({ id: world.id, image: `/lab-assets/locations/${world.id}/still.png`, width: 1920, height: 1088, kind: 'kit', depths: [],
      prompt: 'S-track test world', seed: BATTLEFIELD.seed, plan: `/lab-assets/locations/${world.id}/plan.json` })
    const meta = JSON.parse(readFileSync(path.join(loc(), world.id, 'meta.json'), 'utf8'))
    expect(typeof meta.world.builtAt).toBe('string')
  })

  it('saves a performance path, refuses a bad one, and serves the world back', async () => {
    const perf = { path: [[0.6, -12.5], [0, -9], [0.5, -7]], pace: 1 } // begins on the default mark: a save snaps the start there
    const r = await post(`/performance?id=${world.id}`, perf)
    expect(r.status).toBe(200)
    expect((await r.json() as KitWorld).perf).toEqual({ ...perf, ...NEW_WALK }) // a changed walk takes the walk's marks (strideFitStamp.ts)
    const bad = await post(`/performance?id=${world.id}`, { path: [[0, 0], [0, 0]] })
    expect(bad.status).toBe(422)
    expect((await bad.json()).errors).toEqual(['the path has no length'])
    expect((await (await fetch(`${base}/world?id=${world.id}`)).json() as KitWorld).perf).toEqual({ ...perf, ...NEW_WALK })
    expect((await fetch(`${base}/world?id=../etc`)).status).toBe(400)
    expect((await fetch(`${base}/world?id=loc-2026-10-23T09-09-09-999`)).status).toBe(404)
  })

  it('answers local pages only, and JSON routes only as JSON', async () => {
    expect((await post('/world', { plan: BATTLEFIELD }, { origin: 'http://evil.example' })).status).toBe(403)
    const text = await fetch(`${base}/world`, { method: 'POST', body: JSON.stringify({ plan: BATTLEFIELD }), headers: { 'content-type': 'text/plain' } })
    expect(text.status).toBe(415)
  })
})
