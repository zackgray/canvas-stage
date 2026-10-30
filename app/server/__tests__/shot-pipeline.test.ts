// Wave B join: the real server path across the three tracks, on one temp public dir and one job runtime (fake Cloud, no
// network, no Python): T1 locks the take and exports its clay (child process stubbed), T2 renders and approves a hero still,
// T3 renders the Layout-To-Render pass and finishes it (Python stubbed). Each step reads only what the step before wrote.
import { EventEmitter } from 'node:events'
import { existsSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import type { Job } from '@comfyorg/sdk'
import { afterAll, describe, expect, it } from 'vitest'
import type { ObjectInfo } from '../comfy/index.ts'
import { isStale, shotPaths, type ClayCamera, type ClayExport, type HeroStill, type L2RRender, type TakeRecord } from '../../src/shared/shotContract.ts'
import { labClay } from '../clay/plugin.ts'
import { defaultYunet } from '../clay/service.ts'
import { DEPTH_BYTES, frameFile } from '../clay/upload.ts'
import { buildHeroGraph } from '../hero/graph.ts'
import { labHero } from '../hero/plugin.ts'
import { pngBytes, world as heroWorld, PACK, WORLD } from '../hero/__tests__/rig.ts'
import { resetClaims } from '../jobs/inflight.ts'
import { resetFinishing, type RunPython } from '../l2r/finish.ts'
import { l2rGraph } from '../l2r/graph.ts'
import { labL2R } from '../l2r/plugin.ts'
import { permissiveInfo } from '../jobs/__tests__/rig.ts'
import { call, JSON_LOCAL } from '../project/__tests__/rig.ts'
import { labTakes } from '../takes/plugin.ts'

type Handler = Parameters<typeof call>[0]
const APP = path.resolve(import.meta.dirname, '..', '..')
const FRAMES = 9
const LOCAL = { origin: 'http://localhost:5173' }

/** one fake Cloud job that answers both graphs: hero saves on o_* nodes (png), L2R on save_t (mp4) */
const job = (id: string): Job => ({
  id, status: 'succeeded', metrics: { execution_ms: 9000 }, wait: async () => {},
  getOutputs: (node: string) => node.startsWith('o_') ? [{ name: 'out.png', toFile: async (p: string) => writeFileSync(p, `still ${id}`) }]
    : node === 'save_t' ? [{ name: 'out.mp4', toFile: async (p: string) => writeFileSync(p, `l2r ${id}`) }] : [],
}) as unknown as Job

function pipeline(blank?: () => Promise<boolean>) {
  // the hero rig's world gives the cast card (with a face), the perform session lifted into PACK and the location; its own
  // fixture take is removed, so every take on disk here is one T1 locked
  const hw = heroWorld({ opening: false })
  rmSync(hw.shot, { recursive: true, force: true })
  const pub = hw.pub
  let n = 0
  // one object_info for both graphs: a node class both use (CLIPLoader…) requires the inputs both send, the rest optional
  type Info = Record<string, { input: { required: Record<string, unknown>; optional?: Record<string, unknown> }; output: unknown }>
  const info = permissiveInfo(buildHeroGraph({ prompt: 'p', picks: [{ id: 'hero-x', seed: 1 }], prefix: 'x' })) as unknown as Info
  for (const [cls, v] of Object.entries(permissiveInfo(l2rGraph({ prompt: 'p', seed: 1, frames: 9, prefix: 'x', layoutSize: { w: 1280, h: 720 } })) as unknown as Info)) {
    const had = info[cls]
    if (!had) { info[cls] = v; continue }
    const all = { ...had.input.required, ...v.input.required }
    const both = Object.fromEntries(Object.entries(all).filter(([k]) => k in had.input.required && k in v.input.required))
    info[cls] = { ...v, input: { required: both, optional: Object.fromEntries(Object.entries(all).filter(([k]) => !(k in both))) } }
  }
  const rt = hw.jobs.restart({ submit: async () => { hw.jobs.submits++; return job(`cccccccc-0000-4000-8000-00000000${String(++n).padStart(4, '0')}`) }, fetchInfo: async () => info as unknown as ObjectInfo }, 500)

  const spawned: string[][] = []
  const clay = labClay({ LIFT_PYTHON: process.execPath }, {
    publicDir: pub, hasFfmpeg: () => true, uploadLimit: DEPTH_BYTES + 1024,
    runner: {
      flushMs: 0, alive: () => false, kill: () => {},
      // the clay script, stubbed: writes the mp4 where it was told and reports like clay.py does
      spawn: (_cmd, args) => {
        spawned.push(args)
        const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: 4242 })
        setTimeout(() => {
          writeFileSync(args[args.indexOf('--out') + 1], 'clay mp4')
          child.stdout.write(`frame ${FRAMES}/${FRAMES}\nfaces found on ${FRAMES}/${FRAMES}\n`)
          child.emit('close', 0)
        }, 5)
        return child
      },
    },
  })
  const py: string[][] = []
  const run: RunPython = async (python, args) => { py.push([python, ...args]); writeFileSync(args[2], 'finished mp4') }
  const probe = async (file: string) => ({ width: 1920, height: 1088, frames: file.endsWith('.mp4') ? FRAMES : 0 })
  const plugins: [{ configureServer?: unknown }, object][] = [
    [labTakes({}, { publicDir: pub }), {}],
    [clay, {}],
    [labHero({ COMFY_BASE_URL: 'http://fake-comfy.invalid' }, { deps: { runtime: () => rt, seed: () => 1000 } }), {}],
    [labL2R({ LIFT_PYTHON: process.execPath, COMFY_BASE_URL: 'http://fake-comfy.invalid' }, { deps: { runtime: () => rt, probe, python: () => '/venv/python', blank: blank ?? (async () => false) }, finish: { run } }), {}],
  ]
  const routes: Record<string, Handler> = {}
  resetClaims(); resetFinishing()
  for (const [p] of plugins) {
    (p.configureServer as (s: unknown) => void)({ config: { root: APP, publicDir: pub, mode: 'test', envDir: APP }, middlewares: { use: (pre: string, h: Handler) => { routes[pre] = h } } })
  }
  const post = (route: string, url: string, b: unknown) => call(routes[route], url, { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify(b) })
  return { hw, pub, rt, routes, post, spawned, py }
}

const sample = (t: number, x = 0) => ({ t, position: [x, 1.6, 4] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 35, focus: 4 })
const lockBody = (x0 = 0) => ({ worldId: WORLD, packId: PACK, fps: 24, frames: FRAMES, focal: 35, viewAspect: 16 / 9, perfStart: 0, timelineStart: 0,
  samples: Array.from({ length: 12 }, (_, i) => sample(i / 24, x0 + i * 0.01)) })
const cameras = (): ClayCamera[] => Array.from({ length: FRAMES }, (_, i) => ({ i, t: i / 24, position: [i * 0.01, 1.6, 4], quaternion: [0, 0, 0, 1], focal: 35, vfovDeg: 30 }))
const until = async (ok: () => Promise<boolean> | boolean, ms = 3000) => {
  const t0 = Date.now()
  while (!(await ok())) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 5)) }
}
const readJson = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T

/** T1 lock, the clay passes and finish, T2 one approved opening still: what a render needs, across the real routes */
async function upToStill(p: ReturnType<typeof pipeline>) {
  const { pub, post, routes } = p
  // T1: lock the take
  const locked = await post('/__lab/takes', '/lock', lockBody())
  expect(locked.status).toBe(201)
  const take = locked.body.take as TakeRecord
  const sp = shotPaths(take.id)
  expect(readJson<TakeRecord>(path.join(pub, sp.take))).toEqual(take)

  // T1: the clay passes (frame by frame, as the page sends them), then finish (the script stubbed)
  const upload = (frame: number, kind: string, body: Buffer) =>
    call(routes['/__lab/clay'], `/depth?take=${take.id}&frame=${frame}&kind=${kind}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', ...LOCAL }, body })
  // frame 0's three passes go through the route; the other frames are sparse files of the checked size (the route is the
  // same per frame, and 8 x 2 x 8 MB of real writes would slow the whole suite)
  const depth = Buffer.alloc(DEPTH_BYTES)
  expect((await upload(0, 'colour', pngBytes())).status).toBe(200)
  expect((await upload(0, 'depth', depth)).status).toBe(200)
  expect((await upload(0, 'bg', depth)).status).toBe(200)
  expect((await post('/__lab/clay', '/finish', { takeId: take.id, cameras: cameras() })).body.error).toMatch(/8 of 9 frames are not uploaded \(first: 1\)/)
  for (let i = 1; i < FRAMES; i++) {
    writeFileSync(path.join(pub, sp.clay, frameFile('colour', i)), pngBytes())
    for (const k of ['depth', 'bg'] as const) { const f = path.join(pub, sp.clay, frameFile(k, i)); writeFileSync(f, ''); truncateSync(f, DEPTH_BYTES) }
  }
  const fin = await post('/__lab/clay', '/finish', { takeId: take.id, cameras: cameras() })
  expect(fin.status).toBe(202)
  expect(p.spawned[0]).toContain('--yunet')
  await until(async () => (await call(routes['/__lab/clay'], `/?take=${take.id}`)).body.clay?.status === 'done')
  const clayGet = (await call(routes['/__lab/clay'], `/?take=${take.id}`)).body.clay as ClayExport & { pid?: number; log?: string[] }
  expect(clayGet).toMatchObject({ takeId: take.id, startKey: take.startKey, frames: FRAMES, mp4: `/${sp.clay}/clay.mp4`, faceFrames: FRAMES })
  expect('pid' in clayGet || 'log' in clayGet).toBe(false)
  expect(existsSync(path.join(pub, sp.clay, 'clay.mp4'))).toBe(true)
  // the raw passes are gone once the clay landed, all but frame 0's colour (B4)
  expect(readdirSync(path.join(pub, sp.clay)).filter((f) => /^(colour|depth|bg)_/.test(f))).toEqual(['colour_000.png'])

  // T2: the opening frame for this start, one hero still (fake job), approve it
  const open = await call(routes['/__lab/hero'], `/opening?take=${take.id}&key=${take.startKey}`, { method: 'POST', headers: { 'content-type': 'image/png', ...LOCAL }, body: pngBytes() })
  expect(open.status).toBe(200)
  const hero = await post('/__lab/hero', '/', { takeId: take.id })
  expect([hero.status, hero.body.error]).toEqual([200, undefined])
  const still = hero.body.still as HeroStill
  expect(still).toMatchObject({ takeId: take.id, startKey: take.startKey, png: `/${sp.hero}/${still.id}.png` })
  expect((await post('/__lab/hero', '/approve', { takeId: take.id, stillId: still.id })).body.still).toMatchObject({ id: still.id, approved: true })
  // the still's URL is the file T3 binds as the look
  expect(path.join(pub, ...still.png.split('/').filter(Boolean))).toBe(path.join(pub, sp.hero, `${still.id}.png`))

  return { take, still, sp }
}

const roots: string[] = []
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }) })

describe('Wave B: take -> clay -> hero still -> Layout-To-Render, across the seams', () => {
  it('each step finds what the step before wrote, and a new start makes the still stale and Render refuse', async () => {
    const p = pipeline(); roots.push(p.hw.root)
    const { pub, post, routes } = p

    const { take, still, sp } = await upToStill(p)

    // T3: the status reads T1's take + clay and T2's approved still; nothing is missing
    const st = (await call(routes['/__lab/l2r'], `/?take=${take.id}`)).body
    expect(st.missing).toEqual([])
    expect(st.still).toMatchObject({ id: still.id, approved: true })
    expect(st.clay).toMatchObject({ status: 'done', startKey: take.startKey, frames: FRAMES })
    expect('pid' in st.clay || 'log' in st.clay).toBe(false)
    expect(st.prompt).toMatch(/, at a muddy medieval battlefield/)

    // T3: render (fake job), then the free finish (Python stubbed) runs on its own
    const r = await post('/__lab/l2r', '/', { takeId: take.id, stillId: still.id })
    expect(r.status).toBe(200)
    const rec = r.body.render as L2RRender
    expect(rec).toMatchObject({ takeId: take.id, stillId: still.id, status: 'done', frames: FRAMES, clay: `/${sp.clay}/clay.mp4`, raw: `/${sp.l2r}/${rec.id}-raw.mp4` })
    await until(() => readJson<L2RRender>(path.join(pub, sp.l2r, `${rec.id}.json`)).finished !== null)
    expect(existsSync(path.join(pub, sp.l2r, `${rec.id}-finished.mp4`))).toBe(true)
    expect(p.py.map((c) => path.basename(c[1]))).toEqual(['sharpen.py', 'grain.py'])
    const submitsAfterRender = p.hw.jobs.submits
    expect(submitsAfterRender).toBe(2)

    // a new start of the take: re-locking a different opening is a new take with nothing yet; Render refuses for free
    const moved = (await post('/__lab/takes', '/lock', lockBody(0.5))).body.take as TakeRecord
    expect(moved.id).not.toBe(take.id)
    expect(moved.startKey).not.toBe(take.startKey)
    expect(isStale(still, moved)).toBe(true)
    const onMoved = await post('/__lab/l2r', '/', { takeId: moved.id, stillId: still.id })
    expect([onMoved.status, onMoved.body.code]).toEqual([409, 'no_clay'])

    // the same take id with a changed start (its take.json rewritten): the clay and the still are stale, Render refuses,
    // and the still can no longer be approved
    writeFileSync(path.join(pub, sp.take), JSON.stringify({ ...take, startKey: 'c0ffee00' }))
    const stale = (await call(routes['/__lab/l2r'], `/?take=${take.id}`)).body
    expect(stale.missing.map((m: { code: string }) => m.code)).toEqual(['clay_stale', 'stale_still'])
    const refused = await post('/__lab/l2r', '/', { takeId: take.id, stillId: still.id })
    expect([refused.status, refused.body.code]).toEqual([409, 'clay_stale'])
    expect((await post('/__lab/hero', '/approve', { takeId: take.id, stillId: still.id })).body.code).toBe('stale')
    expect(p.hw.jobs.submits).toBe(submitsAfterRender)
  })

  it('a render that came back solid black is filed failed (kept, billed, said plainly) and never finished', async () => {
    const p = pipeline(async () => true); roots.push(p.hw.root)
    const { take, still, sp } = await upToStill(p)
    const r = await p.post('/__lab/l2r', '/', { takeId: take.id, stillId: still.id })
    expect([r.status, r.body.code]).toEqual([422, 'black_output'])
    expect(r.body.error).toMatch(/^The render came back black\. Nothing usable was saved\. You were billed [\d.]+ cr\.$/)
    const files = readdirSync(path.join(p.pub, sp.l2r))
    const recFile = files.find((f) => /^l2r-.*\d\.json$/.test(f))!
    const rec = readJson<L2RRender>(path.join(p.pub, sp.l2r, recFile))
    expect(rec).toMatchObject({ status: 'failed', blank: true, raw: `/${sp.l2r}/${rec.id}-raw.mp4`, finished: null })
    expect(existsSync(path.join(p.pub, sp.l2r, `${rec.id}-raw.mp4`))).toBe(true) // kept
    await new Promise((res) => setTimeout(res, 50))
    expect(p.py).toEqual([]) // no finish of a black raw
    const st = (await call(p.routes['/__lab/l2r'], `/?take=${take.id}`)).body
    expect(st.renders[0]).toMatchObject({ id: rec.id, status: 'failed', blank: true })
  })

  it('the clay face model ships with the app (no CLAY_YUNET needed)', () => {
    expect(existsSync(defaultYunet(APP))).toBe(true)
    expect(defaultYunet(APP)).toBe(path.join(APP, 'scripts', 'clay', 'models', 'face_detection_yunet_2023mar.onnx'))
  })
})
