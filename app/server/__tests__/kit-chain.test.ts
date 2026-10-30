// Intersection, kit world -> Render (Stage3D overnight join): the meaning carried across every seam, through the real routes and
// stores over a temp public dir. A world registered from BATTLEFIELD over the stage3d route; a performance with actions, a turn
// radius and a cast card stored and read back; the 3D performer built from what came back (real CMU clips, fetch served from
// public/); a take locked with its mocap pack id; finished clay frames uploaded where the clay route puts them and encoded by the
// real ffmpeg; the hero still over the fake Cloud (no network, no credits); Render's readiness and both prompts. Then the
// identity seams: a path edit makes a new performance (the old take reads as changed), a cast change stales the approved still.
import { execFileSync } from 'node:child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { isStale, type ClayExport, type HeroStill, type TakeRecord } from '../../src/shared/shotContract.ts'
import type { PerformancePlan } from '../../src/stage3d/contract.ts'
import { performerFrom } from '../../src/stage3d/performer.ts'
import { BATTLEFIELD, PLANS, WALK_TOWARD } from '../../src/stage3d/presets.ts'
import { CLAY_MAX, lockKey, lockRequest } from '../../src/labs/projection/clay/plan.ts'
import { performanceMismatch } from '../../src/labs/projection/clay/exportClay.ts'
import { fakeTake } from '../../src/labs/projection/clay/__fixtures__/take.ts'
import { mocapPack, MocapLayer } from '../../src/labs/projection/stage3d/MocapLayer.ts'
import { flatGround, performer } from '../../src/labs/projection/stage3d/__tests__/performer.ts'
import { diskLibrary } from '../../src/stage3d/__tests__/motion.fixture.ts'
import { capNotice, changedSinceLock } from '../../src/studio/shoot/takeLock.ts'
import { ClayService } from '../clay/service.ts'
import { uploadTarget } from '../clay/upload.ts'
import { buildDrawPrompt } from '../hero/kitStillPrompt.ts'
import { kitInfo, pngJob, stillPng, zdepthPng } from '../hero/__tests__/kitRig.ts'
import { mount, world as heroWorld, type World } from '../hero/__tests__/rig.ts'
import { readiness } from '../l2r/inputs.ts'
import { promptFor } from '../l2r/prompt.ts'
import { BANNED, GRAIN } from '../prompt/banned.ts'
import { labStage3D, STAGE3D_ROUTE } from '../stage3d/plugin.ts'
import { NEW_WALK } from '../stage3d/strideFitStamp.ts'
import type { KitPerformance, KitWorld } from '../stage3d/types.ts'
import { parseLockRequest } from '../takes/request.ts'
import { lockTake } from '../takes/store.ts'
import { approveSetOnDisk } from '../bible/__tests__/approveFixture.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let w: World, base = '', close = () => {}
let clock = Date.parse('2026-10-23T06:00:00.000Z')

beforeAll(async () => {
  w = heroWorld() // a temp public dir with a project whose cast card "ana" has a face, and the fake Cloud
  let handler: Handler | null = null
  const plugin = labStage3D({}, { publicDir: w.pub, now: () => new Date((clock += 1000)) }) as unknown as { configureServer: (s: unknown) => void }
  plugin.configureServer({ middlewares: { use: (_p: string, h: Handler) => { handler = h } } })
  const server = createServer((req, res) => { req.url = req.url!.slice(STAGE3D_ROUTE.length) || '/'; handler!(req, res, () => { res.statusCode = 404; res.end() }) })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})
afterAll(() => { close(); vi.unstubAllGlobals(); rmSync(w.root, { recursive: true, force: true }) })

// the stage3d route is called with the real fetch, captured before the performer helper stubs it for the clip files
const realFetch = globalThis.fetch
const route = async <T>(p: string, body?: unknown): Promise<{ status: number; body: T }> => {
  const r = await realFetch(`${base}${STAGE3D_ROUTE}${p}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  return { status: r.status, body: (await r.json()) as T }
}

/** walk 5 m, a gentle bend (rounded by the turn radius), stop and kneel at the second corner, then walk off to the right */
const L_PLAN: KitPerformance = {
  path: [[0.6, -12.5], [0.6, -8], [1.6, -5], [4.6, -5]],
  actions: [{ kind: 'stop', at: 8.16, seconds: 1 }, { kind: 'kneel', at: 8.16, seconds: 1.5 }, { kind: 'look', at: 8.16, deg: 40, seconds: 1.2 }],
  pace: 0.9, gait: 'walk', turnRadius: 2.5, castId: 'ana',
}
const motionOf = ({ castId: _c, ...m }: KitPerformance): PerformancePlan => m

describe('kit world -> performance -> performer -> take -> clay -> hero -> Render', () => {
  let kit: KitWorld, take: TakeRecord, still: HeroStill

  it('every preset plan registers through the studio\'s route (parsePlan on the server, default walk in its corridor)', async () => {
    for (const [name, plan] of Object.entries(PLANS)) {
      const r = await route<KitWorld & { errors?: string[] }>('/world', { plan })
      expect([name, r.status, r.body.errors]).toEqual([name, 201, undefined])
      const [x0, z0, x1, z1] = plan.flat!
      for (const [x, z] of r.body.perf.path) expect(x >= x0 && x <= x1 && z >= z0 && z <= z1, `${name}: default walk inside flat`).toBe(true)
    }
    const r = await route<KitWorld>('/world', { plan: BATTLEFIELD })
    expect(r.status).toBe(201)
    kit = r.body
    expect(kit.plan.sentence).toBe(BATTLEFIELD.sentence) // nothing is prefixed into a real world's sentence
    expect(kit.description).toBe(BATTLEFIELD.sentence)
  })

  it('stores the performance and reads back every field the timeline reads; unknown action kinds are refused in words', async () => {
    const saved = await route<KitWorld>(`/performance?id=${kit.id}`, L_PLAN)
    expect(saved.status).toBe(200)
    const back = await route<KitWorld>(`/world?id=${kit.id}`)
    expect(back.body.perf).toEqual({ ...L_PLAN, ...NEW_WALK }) // a new walk takes the walk's marks (server/stage3d/strideFitStamp.ts)
    kit = back.body
    const bad = await route<{ errors: string[] }>(`/performance?id=${kit.id}`, { ...L_PLAN, actions: [{ kind: 'start', at: 0 }] })
    expect(bad.status).toBe(422)
    expect(bad.body.errors[0]).toMatch(/actions\[0\] needs a kind \(stop, turn, look, idle, kneel, lift, move\)/)
    expect((await route<{ errors: string[] }>(`/performance?id=${kit.id}`, { ...L_PLAN, turnRadius: -1 })).status).toBe(422)
  })

  it('the performer built from the read-back plan is the one the page meant (createPerformer over the disk clips)', async () => {
    const p = await performer(kit.perf)
    const lib = await diskLibrary()
    const meant = performerFrom({ ...motionOf(L_PLAN), ...NEW_WALK }, flatGround, lib)
    const noRadius = performerFrom({ ...motionOf(L_PLAN), ...NEW_WALK, turnRadius: undefined }, flatGround, lib)
    expect(p.duration).toBeCloseTo(meant.duration, 9)
    for (const t of [0.5, 3, p.duration - 0.2]) expect(p.anchorAt(t).distanceTo(meant.anchorAt(t))).toBeLessThan(1e-9)
    expect(meant.timeline.segs.map((s) => s.kind)).toEqual(expect.arrayContaining(['start', 'travel', 'stop', 'kneel', 'look']))
    expect(Math.abs(noRadius.duration - meant.duration)).toBeGreaterThan(1e-3) // the radius reached the timeline
  })

  it('locks a take with the mocap pack id; the take, the pack and the clay agree on frames', async () => {
    const layer = new MocapLayer(await performer(kit.perf), kit.perf, kit.id)
    const q = parseLockRequest(JSON.parse(JSON.stringify(lockRequest(fakeTake(1), layer.pack, kit.id, 16 / 9))))
    if (typeof q === 'string') throw new Error(q)
    take = lockTake(w.pub, q, new Date('2026-10-23T06:10:00.000Z')).take
    expect(take).toMatchObject({ worldId: kit.id, packId: layer.pack.id, frames: 25, perfStart: 0 })
    expect(take.packId).toMatch(/^mocap-[0-9a-f]{8}$/)
  })

  it('kit clay: final frames where the upload route puts them, real ffmpeg, a clay Render accepts', async () => {
    const files = Array.from({ length: take.frames }, (_, i) => {
      const t = uploadTarget(w.pub, new URLSearchParams({ take: take.id, frame: String(i), kind: 'final' }))
      if (Array.isArray(t)) throw new Error(t[1])
      return t.file
    })
    const dir = path.dirname(files[0])
    mkdirSync(dir, { recursive: true }) // the upload route makes it on the first frame
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1920x1088:r=24', '-frames:v', String(take.frames), '-start_number', '0', path.join(dir, 'final_%03d.png')], { windowsHide: true })
    const svc = new ClayService({ publicDir: w.pub, appDir: w.pub, python: () => undefined, yunet: `${w.pub}/none.onnx`, hasFfmpeg: () => true, runner: { flushMs: 0, keepFrames: () => false } })
    expect(svc.finish({ takeId: take.id }).code).toBe(202)
    const t0 = Date.now()
    while (readiness(w.pub, take.id).clay?.status === 'running' && Date.now() - t0 < 60_000) await new Promise((r) => setTimeout(r, 50))
    const r = readiness(w.pub, take.id)
    expect(r.clay).toMatchObject({ status: 'done', method: 'browser', frames: take.frames, startKey: take.startKey } satisfies Partial<ClayExport>)
    expect(r.missing.map((m) => m.code)).toEqual(['no_still'])
  }, 90_000)

  it('the hero still (fake Cloud): drawn on the clay depth (Qwen), finished with the cast card Perform picked (Klein); approved, Render is ready', async () => {
    // the browser kit clay writes a metric depth per frame beside the clay frames (kitDepth.ts); here frame 0's, as a fixture
    const clayDir = path.join(w.pub, 'lab-assets', 'shots', take.id, 'clay'), cf = path.join(clayDir, 'clay.json')
    writeFileSync(cf, JSON.stringify({ ...JSON.parse(readFileSync(cf, 'utf8')), depth: { kind: 'planar', unitM: 0.01, frames: take.frames, width: 1920, height: 1088, pattern: 'zdepth_%03d.png' } }))
    writeFileSync(path.join(clayDir, 'zdepth_000.png'), zdepthPng())
    w.queue.push(pngJob('aaaaaaaa-0000-4000-8000-0000000c0a01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-0000000c0a02', stillPng()))
    approveSetOnDisk(w.pub, kit.id) // (guided wave) the owner approved the set before the still: the press refuses otherwise
    const hero = mount(w, w.runtime({ fetchInfo: async () => kitInfo() }))
    const r = await hero.render({ takeId: take.id })
    expect(r.status).toBe(200)
    still = (r.body as { still: HeroStill }).still
    expect(still).toMatchObject({ castId: 'ana', role: 'opening', frame: 0 })
    const [draw, fin] = w.submitted.slice(-2).map((x) => JSON.stringify(x.json))
    expect(draw).toMatch(/ControlNetApplyAdvanced/); expect(draw).not.toMatch(/QwenImageDiffsynthControlnet/) // E130: the Fun ControlNet Union
    expect(draw).toMatch(/a muddy medieval battlefield at dusk/i) // the place, inside the recipe's photograph sentence
    expect(draw).toMatch(/short dark hair/) // ana's card, in words: the draw sees no image
    expect(fin).toMatch(/Flux2/)
    expect((await hero.approve(still.id, take.id)).status).toBe(200)
    expect(readiness(w.pub, take.id).missing).toEqual([])
    expect(w.jobs.submits).toBe(2)
  })

  it('Render\'s prompt reads the plan sentence whole (its fire words kept: nothing is scrubbed) and the cast card; a fire-less plan\'s hero prompt names no fire', async () => {
    const p = await promptFor(w.pub, take)
    expect(p).toMatch(/^A battle-worn woman in her thirties .*, at a muddy medieval battlefield at dusk: broken fences, a burning palisade, spears in the mud/)
    expect(GRAIN.test(p)).toBe(false) // the app adds no grain words of its own
    const plain = { ...BATTLEFIELD, sentence: 'A muddy field at dusk: broken fences and spears in the mud; a lone soldier walks toward us.', kit: BATTLEFIELD.kit.filter((k) => k.kind !== 'fire') }
    const made = await route<KitWorld>('/world', { plan: plain })
    expect(made.status).toBe(201)
    const hp = buildDrawPrompt({ bible: null, plan: made.body.plan, cast: { name: 'Ana', description: 'a soldier' } })
    expect(BANNED.test(hp)).toBe(false)
    expect(hp).toMatch(/^A soldier[^.]*, a muddy field at dusk\./)
    expect(hp).toMatch(/\bfences?\b/) // several fence pieces read as "fences" (debris fix)
    expect(hp).not.toMatch(/split-rail|weathered|broken in places/) // no aged words of the app's own
  })

  it('a cast change after approval stales the still at Render (free), and picking him back restores it', async () => {
    await route(`/performance?id=${kit.id}`, { ...L_PLAN, castId: 'brann' })
    expect(readiness(w.pub, take.id).missing.map((m) => m.code)).toEqual(['stale_still'])
    await route(`/performance?id=${kit.id}`, L_PLAN)
    expect(readiness(w.pub, take.id).missing).toEqual([])
  })

  it('a path edit is a new performance: the locked take reads as changed, its clay cannot be re-made, a relock is a new take', async () => {
    const edited = (await route<KitWorld>(`/performance?id=${kit.id}`, { ...L_PLAN, path: [[0.6, -12.5], [0.6, -9]] })).body.perf
    const pack = mocapPack(edited, kit.id, (await performer(edited)).duration)
    expect(pack.id).not.toBe(take.packId)
    const key = lockKey(take)
    expect(changedSinceLock(take, key, kit.id, take.packId)).toBe(false)
    expect(changedSinceLock(take, key, kit.id, pack.id)).toBe(true)
    expect(performanceMismatch(take, pack)).toMatch(/put the take's performance back on the set/)
    const q = parseLockRequest(JSON.parse(JSON.stringify(lockRequest(fakeTake(1), pack, kit.id, 16 / 9))))
    if (typeof q === 'string') throw new Error(q)
    const relocked = lockTake(w.pub, q, new Date('2026-10-23T06:20:00.000Z')).take
    expect(relocked.id).not.toBe(take.id)
    expect(relocked.startKey).toBe(take.startKey) // same camera, same opening key: only the take id tells them apart
    expect(isStale(still, relocked)).toBe(true)
    expect(readiness(w.pub, relocked.id).missing.map((m) => m.code)).toEqual(['no_clay', 'no_still'])
  })
})

describe('duration and frames agree: the take cap, the take-cap notice, the lock and the clay', () => {
  const lengths = async (plan: PerformancePlan) => {
    const d = (await performer(plan)).duration
    const pack = mocapPack(plan, 'loc-x', d)
    const frames = lockRequest(fakeTake(d + 2), { ...pack }, 'loc-x', 16 / 9).frames
    return { d, pack, frames, notice: capNotice(pack.frames) }
  }
  it('the default walk (~4.4 s with its start and stop) locks whole, no notice', async () => {
    const r = await lengths(WALK_TOWARD)
    expect(r.d).toBeGreaterThan(4); expect(r.d).toBeLessThan(5)
    expect(r.pack.frames).toBe(Math.ceil(r.d * 24 - 1e-9))
    expect(r.notice).toBeNull()
    expect(r.frames).toBeLessThanOrEqual(r.pack.frames); expect(r.pack.frames - r.frames).toBeLessThan(8 + 1)
  })
  it('the L path with a stop and a kneel runs past the cap: the notice says so and the lock keeps exactly CLAY_MAX', async () => {
    const r = await lengths(motionOf(L_PLAN))
    expect(r.pack.frames).toBeGreaterThan(CLAY_MAX)
    expect(r.notice).toMatch(new RegExp(`walks for ${(r.pack.frames / 24).toFixed(1)} s.*\\(${CLAY_MAX} frames\\)`))
    expect(r.frames).toBe(CLAY_MAX)
  })
})
