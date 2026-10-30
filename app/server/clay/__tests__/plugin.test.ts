import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTES, shotPaths, type ClayCamera, type ClayExport } from '../../../src/shared/shotContract.ts'
import { lockTake } from '../../takes/store.ts'
import { labClay } from '../plugin.ts'
import { DEPTH_BYTES, frameFile } from '../upload.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = ''
let close = () => {}
let pub = ''
const mounts: string[] = []
const spawned: { cmd: string; args: string[]; child: EventEmitter & { stdout: PassThrough; stderr: PassThrough; pid: number } }[] = []
let take = ''
const FRAMES = 9

const cam = (i: number): ClayCamera => ({ i, t: i / 24, position: [0, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35, vfovDeg: 30 })
const cameras = Array.from({ length: FRAMES }, (_, i) => cam(i))

beforeAll(async () => {
  pub = mkdtempSync(path.join(tmpdir(), 'clay-'))
  const yunet = path.join(pub, 'yunet.onnx')
  writeFileSync(yunet, 'model')
  take = lockTake(pub, { worldId: 'loc-a', packId: 'pack-a', fps: 24, frames: FRAMES, focal: 35, viewAspect: 16 / 9, perfStart: 0,
    samples: [{ t: 0, position: [0, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35, focus: 3 }] }).take.id
  const routes: [string, Handler][] = []
  const plugin = labClay({ LIFT_PYTHON: process.execPath, CLAY_YUNET: yunet }, {
    publicDir: pub, hasFfmpeg: () => true, uploadLimit: DEPTH_BYTES + 1024,
    runner: {
      flushMs: 0, alive: () => false, kill: () => {},
      spawn: (cmd, args) => {
        const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: 4242 })
        spawned.push({ cmd, args, child })
        return child
      },
    },
  }) as { configureServer: (s: unknown) => void }
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

const clayDir = () => path.join(pub, shotPaths(take).clay)
const upload = (q: string, body: Uint8Array, headers: Record<string, string> = {}) =>
  fetch(`${base}${ROUTES.clay}/depth?${q}`, { method: 'POST', body: body as BodyInit, headers: { 'content-type': 'application/octet-stream', ...headers } })
const finish = (body: unknown) => fetch(`${base}${ROUTES.clay}/finish`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const status = async () => { const r = await fetch(`${base}${ROUTES.clay}?take=${take}`); return { code: r.status, body: await r.json() as { clay: ClayExport } } }
const until = async (ok: () => Promise<boolean>) => { for (let i = 0; i < 100; i++) { if (await ok()) return; await new Promise((r) => setTimeout(r, 10)) } throw new Error('timed out') }
/** every pass of every frame on disk (sparse files: the size is what the server checks) */
function fillFrames() {
  mkdirSync(clayDir(), { recursive: true })
  for (let i = 0; i < FRAMES; i++) {
    writeFileSync(path.join(clayDir(), frameFile('colour', i)), 'png!')
    for (const k of ['depth', 'bg'] as const) { const p = path.join(clayDir(), frameFile(k, i)); writeFileSync(p, ''); truncateSync(p, DEPTH_BYTES) }
  }
}

describe('clay uploads', () => {
  it('streams a depth pass to shots/<take>/clay/depth_NNN.f32 and checks its size', async () => {
    expect(mounts).toEqual([ROUTES.clay])
    const ok = await upload(`take=${take}&frame=3&kind=depth`, new Uint8Array(DEPTH_BYTES))
    expect(ok.status).toBe(200)
    expect(readFileSync(path.join(clayDir(), 'depth_003.f32')).length).toBe(DEPTH_BYTES)
    expect((await upload(`take=${take}&frame=3&kind=bg`, new Uint8Array(100))).status).toBe(400)
    expect(existsSync(path.join(clayDir(), 'bg_003.f32'))).toBe(false)
    expect((await upload(`take=${take}&frame=0&kind=colour`, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]))).status).toBe(200)
    expect(existsSync(path.join(clayDir(), 'colour_000.png'))).toBe(true)
  })

  it('refuses a body over the cap (413) and leaves nothing behind', async () => {
    const r = await upload(`take=${take}&frame=1&kind=colour`, new Uint8Array(DEPTH_BYTES + 4096))
    expect(r.status).toBe(413)
    expect(readdirSync(clayDir()).filter((n) => n.startsWith('colour_001'))).toEqual([])
    // no content-length (a streamed body): cut off while it streams
    const chunk = new Uint8Array(1024 * 1024)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ < 10) c.enqueue(chunk); else c.close() } })
    const streamed = await fetch(`${base}${ROUTES.clay}/depth?take=${take}&frame=2&kind=colour`, { method: 'POST', body, duplex: 'half' } as RequestInit)
    expect(streamed.status).toBe(413)
    await until(async () => readdirSync(clayDir()).filter((n) => n.startsWith('colour_002')).length === 0)
  })

  it('keeps every write inside the take folder: unknown takes, traversal, bad frames and kinds are refused', async () => {
    // a take.json planted outside shots/: a traversal id that reached it would write beside it
    const planted = path.join(pub, 'lab-assets', 'evil')
    mkdirSync(planted, { recursive: true })
    writeFileSync(path.join(planted, 'take.json'), JSON.stringify({ id: '../evil', frames: FRAMES }))
    expect((await upload(`take=${encodeURIComponent('../evil')}&frame=0&kind=colour`, new Uint8Array(16))).status).toBe(404)
    expect(readdirSync(planted)).toEqual(['take.json'])
    for (const q of [`take=../../evil&frame=0&kind=colour`, `take=${take}/../../evil&frame=0&kind=colour`, `take=take-nope&frame=0&kind=colour`,
      `take=${encodeURIComponent('..\\..\\evil')}&frame=0&kind=colour`]) {
      expect((await upload(q, new Uint8Array(16))).status).toBe(404)
    }
    for (const q of [`take=${take}&frame=9&kind=colour`, `take=${take}&frame=-1&kind=colour`, `take=${take}&frame=1.5&kind=colour`,
      `take=${take}&frame=0&kind=../x`, `take=${take}&frame=0&kind=mask`]) {
      expect((await upload(q, new Uint8Array(16))).status).toBe(400)
    }
    expect(existsSync(path.join(pub, 'evil'))).toBe(false)
    expect(readdirSync(pub).sort()).toEqual(['lab-assets', 'yunet.onnx'])
    expect(readdirSync(path.join(pub, 'lab-assets')).sort()).toEqual(['evil', 'shots'])
    expect((await upload(`take=${take}&frame=0&kind=colour`, new Uint8Array(16), { origin: 'http://evil.example' })).status).toBe(403)
  })
})

describe('clay finish', () => {
  it('refuses until every frame is uploaded, and checks the cameras', async () => {
    const missing = await finish({ takeId: take, cameras })
    expect(missing.status).toBe(400)
    expect((await missing.json() as { error: string }).error).toMatch(/not uploaded/)
    fillFrames()
    expect((await finish({ takeId: take, cameras: cameras.slice(1) })).status).toBe(400)
    expect((await finish({ takeId: take, cameras: cameras.map((c) => ({ ...c, vfovDeg: 0 })) })).status).toBe(400)
    expect((await finish({ takeId: 'take-nope', cameras })).status).toBe(404)
    expect((await status()).code).toBe(200) // no clay yet: an answer (clay null), never a 404 in the console
    expect((await status()).body.clay).toBeNull()
  })

  it('runs the clay script as a child, reports progress, 409s a second finish and uploads while it runs, then lands clay.mp4', async () => {
    const r = await finish({ takeId: take, cameras, key: [1, 0, 1] })
    expect(r.status).toBe(202)
    expect((await r.json() as { clay: ClayExport }).clay).toMatchObject({ takeId: take, status: 'running', frames: FRAMES, width: 1920, height: 1088, mp4: null })
    const { cmd, args, child } = spawned[0]
    expect(cmd).toBe(process.execPath)
    expect(path.basename(args[0])).toBe('clay.py')
    expect(args.slice(1, 5)).toEqual(['--in', clayDir(), '--out', path.join(clayDir(), 'clay.mp4')])
    expect(args).toContain('--yunet')
    expect(args.slice(-2)).toEqual(['--key', '1,0,1'])
    const cams = JSON.parse(readFileSync(path.join(clayDir(), 'cameras.json'), 'utf8'))
    expect(cams).toMatchObject({ width: 1920, height: 1088, fps: 24 })
    expect(cams.frames).toHaveLength(FRAMES)

    expect((await finish({ takeId: take, cameras })).status).toBe(409)
    expect((await upload(`take=${take}&frame=0&kind=colour`, new Uint8Array(16))).status).toBe(409)

    child.stdout.write('faces found on 7/9 frames\nframe 5/9\n')
    await until(async () => (await status()).body.clay.done === 5)
    expect((await status()).body.clay.faceFrames).toBe(7)
    child.emit('close', 0)
    const done = (await status()).body.clay
    expect(done).toMatchObject({ status: 'done', done: FRAMES, mp4: `/${shotPaths(take).clay}/clay.mp4`, still: `/${shotPaths(take).clay}/clay-f0.png` })
    expect(JSON.parse(readFileSync(path.join(clayDir(), 'clay.json'), 'utf8')).pid).toBeUndefined()
  })

  it('a failed script reads as failed with its last line; the next finish may run', async () => {
    expect((await finish({ takeId: take, cameras })).status).toBe(202)
    const { child } = spawned[1]
    child.stderr.write('error: frame 4: depth is not 1920x1088 Float32\n')
    child.emit('close', 1)
    const f = (await status()).body.clay
    expect(f.status).toBe('failed')
    expect(f.mp4).toBeNull()
    expect(f.error).toMatch(/exit 1.*frame 4/)
  })

  it('a "running" clay.json with no live process behind it (a restarted server) reads as interrupted', async () => {
    const file = path.join(clayDir(), 'clay.json')
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), status: 'running', pid: 999999, startedAt: new Date().toISOString() }))
    const f = (await status()).body.clay
    expect(f.status).toBe('failed')
    expect(f.error).toMatch(/interrupted/)
  })
})

describe('a new export forgets the last massing clay (join: server/pieces/modelClay.ts)', () => {
  it('the first final frame of an export drops massing.json; any other upload leaves it', async () => {
    const m = path.join(pub, shotPaths(take).clay, 'massing', 'massing.json')
    mkdirSync(path.dirname(m), { recursive: true }); writeFileSync(m, '{}')
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0])
    expect((await upload(`take=${take}&frame=1&kind=final`, png)).status).toBe(200)
    expect((await upload(`take=${take}&frame=0&kind=zdepth`, png)).status).toBe(200)
    expect(existsSync(m)).toBe(true)
    expect((await upload(`take=${take}&frame=0&kind=final`, png)).status).toBe(200)
    expect(existsSync(m)).toBe(false)
  })
})
