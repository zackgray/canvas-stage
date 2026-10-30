// "Draw from your approved frame" end to end on the fake Cloud (no network, no credits): the free refusals spend nothing and leave no
// intent, the plate is made once per take and start, the intent and the final still record the plate and the look frame, the
// preview shows the plate state and the price, and the empty-depth script really removes the performer. Fake Python runner.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { permissiveInfo } from '../../jobs/__tests__/rig.ts'
import { buildEditGraph } from '../editGraph.ts'
import type { KitStill } from '../kitSpec.ts'
import { kitInfo, kitTake, pngJob, stillPng, type KitTake } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'

type Sent = { json: Record<string, { class_type?: string; inputs: Record<string, unknown> }> }
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const OTHER = 'take-2026-10-22T11-00-00-000', LOOK = 'hero-2026-10-22T11-05-00-000-1'
/** object_info for the Klein, Qwen draw and edit graphs: where a class is in more than one, the first's inputs are required and the other's extras optional */
function info() {
  type Info = Record<string, { input: { required: Record<string, unknown>; optional?: Record<string, unknown> } }>
  const a = kitInfo() as unknown as Info
  const b = permissiveInfo(buildEditGraph({ prompt: 'p', seeds: [1], prefix: 'x' })) as unknown as Info
  const out: Info = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = out[k] ? { ...out[k], input: { ...out[k].input, optional: { ...v.input.required } } } : v
  return out as never
}
const HERO = [200, 30, 30], HIVE = [30, 30, 200]

/** the fake runner: "inpaints" by copying the depth to --out */
const fakePython = { python: () => 'python' as string | undefined, appDir: APP, runPython: async (_py: string, args: string[]) => { copyFileSync(args[args.indexOf('--depth') + 1], args[args.indexOf('--out') + 1]) } }
const hero = (t: KitTake, over = {}) => mount(t, t.runtime({ fetchInfo: async () => info() }), { ...fakePython, ...over })
const queue = (t: KitTake, n: number) => { for (let i = 0; i < n; i++) t.queue.push(pngJob(`aaaaaaaa-0000-4000-8000-000000000b0${i}`, stillPng())) }
const edit = (t: KitTake, body: object = {}, over = {}) => hero(t, over).render({ mode: 'edit', count: 1, ...body })
const preview = async (t: KitTake, body: object = {}) => (await hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE, ...body }) })).body as unknown as StillPreviewResponse
const kinds = (t: KitTake) => t.submitted.map((s) => ('m1' in (s as Sent).json ? 'edit' : 'unet' in (s as Sent).json ? 'plate' : 'klein'))
const intents = (t: KitTake) => readdirSync(t.heroDir).filter((f) => f.startsWith('intent-'))
const errorOf = (r: { body: unknown }) => String((r.body as { error?: string }).error)

/** an approved opening of another take of this world and cast (the look frame) */
function lookFrame(t: KitTake) {
  const dir = path.join(t.pub, 'lab-assets', 'shots', OTHER, 'hero')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, '..', 'take.json'), JSON.stringify({ ...t.take, id: OTHER, lockedAt: '2026-10-22T11:00:00.000Z' }))
  writeFileSync(path.join(dir, `${LOOK}.png`), stillPng())
  writeFileSync(path.join(dir, `${LOOK}.json`), JSON.stringify({ id: LOOK, takeId: OTHER, startKey: t.take.startKey, png: '', seed: 7, jobId: 'j', credits: 21, approved: true, createdAt: '2026-10-22T11:05:00.000Z', castId: 'ana', role: 'opening' }))
}
/** the clay's ID pass at frame 0: a hero block and a hive block (each its own colour) */
function idPass(t: KitTake) {
  const png = new PNG({ width: 192, height: 108 })
  for (let y = 0; y < 108; y++) for (let x = 0; x < 192; x++) {
    const c = x >= 60 && x < 90 && y >= 30 && y < 100 ? HERO : x >= 120 && x < 150 && y >= 60 && y < 100 ? HIVE : [0, 0, 0], i = (y * 192 + x) * 4
    png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255
  }
  writeFileSync(path.join(t.clayDir, 'id_000.png'), PNG.sync.write(png))
  const f = path.join(t.clayDir, 'clay.json'), clay = JSON.parse(readFileSync(f, 'utf8'))
  writeFileSync(f, JSON.stringify({ ...clay, idPass: { frames: [0], pattern: 'id_%03d.png', colors: { hero: HERO, 'prop:hive': HIVE } } }))
}
const ready = (o: Parameters<typeof kitTake>[0] = {}) => { const t = kitTake(o); lookFrame(t); idPass(t); return t }

describe('the free refusals spend nothing and leave no intent', () => {
  it('no approved frame of another shot: 409, the words say what to do, no job, no intent, no plate', async () => {
    const t = kitTake(); idPass(t)
    const r = await edit(t)
    expect(r.status).toBe(409)
    expect(errorOf(r)).toMatch(/Approve a first frame of another shot of this scene first/)
    expect([t.jobs.submits, intents(t), existsSync(path.join(t.heroDir, 'plate-000.png'))]).toEqual([0, [], false])
  })
  it('no ID pass at the frame: 409, nothing sent, nothing written', async () => {
    const t = kitTake(); lookFrame(t)
    const r = await edit(t)
    expect(r.status).toBe(409)
    expect(errorOf(r)).toMatch(/ID pass/)
    expect([t.jobs.submits, intents(t)]).toEqual([0, []])
  })
  it('no Python: 409, nothing sent, no intent', async () => {
    const t = ready()
    const r = await edit(t, {}, { python: () => undefined })
    expect(r.status).toBe(409)
    expect(errorOf(r)).toMatch(/Python was not found/)
    expect([t.jobs.submits, intents(t)]).toEqual([0, []])
  })
  it('an unknown mode is a 400, and a press without a mode is today\'s depth press (two jobs)', async () => {
    const t = ready()
    expect((await edit(t, { mode: 'inpaint' })).status).toBe(400)
    queue(t, 2)
    expect((await hero(t).render({ count: 1 })).status).toBe(200)
    expect(kinds(t)).toEqual(['plate', 'klein']) // the depth draw has no edit graph: the first graph is the Qwen draw, then Klein
  })
})

describe('one press: the plate, the edit, the finish', () => {
  it('sends three jobs the first time; the plate is empty-set only, the edit is the validated graph; the still records both sources', async () => {
    const t = ready(); queue(t, 3)
    const r = await edit(t)
    expect(r.status).toBe(200)
    expect(kinds(t)).toEqual(['plate', 'edit', 'klein'])
    const [plate, ed] = t.submitted as Sent[]
    expect(String(plate.json.pos.inputs.text)).not.toMatch(/woman|\bshe\b|beekeeper/i)
    expect(String(plate.json.neg.inputs.text)).toContain('人物') // people in the plate's negative
    expect(plate.json.cn.inputs).toMatchObject({ strength: 0.65, end_percent: 0.5 }) // the Photographic lock
    expect(String(ed.json.pos.inputs.prompt)).toContain('Add nothing else to the place')
    expect(existsSync(path.join(t.heroDir, 'depth-empty-000.png'))).toBe(true)
    const still = (r.body as { still: KitStill }).still
    expect(still).toMatchObject({ madeBy: 'plate+qwen-edit-2511+union-depth -> klein-4b', drawMode: 'edit', plateId: 'plate-000', lookStillId: LOOK, lookTakeId: OTHER, depthStrength: 0.35, depthEnd: 0.4 })
    expect(existsSync(path.join(t.heroDir, 'plate-000.json'))).toBe(true)
  })

  it('a second press on the same take and start sends two jobs (the plate is reused); a new start key draws the plate again', async () => {
    const t = ready(); queue(t, 5)
    await edit(t)
    await edit(t)
    expect(kinds(t)).toEqual(['plate', 'edit', 'klein', 'edit', 'klein'])
    const f = path.join(t.heroDir, 'plate-000.json')
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), startKey: 'an-older-start' }))
    queue(t, 3)
    await edit(t)
    expect(kinds(t).slice(5)).toEqual(['plate', 'edit', 'klein'])
  })

  it('two seeds are one edit job with two samplers; a plate that landed while the edit failed is kept for the next press', async () => {
    const t = ready(); queue(t, 1)
    t.queue.push({ id: 'aaaaaaaa-0000-4000-8000-000000000c01', status: 'failed', metrics: {}, wait: async () => {}, getOutputs: () => [] } as never)
    const bad = await edit(t, { count: 2 })
    expect(bad.status).toBeGreaterThanOrEqual(400)
    expect(existsSync(path.join(t.heroDir, 'plate-000.json'))).toBe(true)
    queue(t, 2)
    await edit(t, { count: 2 })
    expect(kinds(t).slice(2)).toEqual(['edit', 'klein'])
    expect(Object.keys((t.submitted[2] as Sent).json).filter((k) => /^k\d+$/.test(k))).toHaveLength(2)
  })

  it('a plate whose png landed but whose record never settled is not drawn (or billed) again; one with no png is', async () => {
    const t = ready(); queue(t, 5)
    await edit(t)
    const f = path.join(t.heroDir, 'plate-000.json')
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), jobId: null, credits: 0 })) // the pending record drawPlate writes before the job
    await edit(t)
    expect(kinds(t)).toEqual(['plate', 'edit', 'klein', 'edit', 'klein'])
    rmSync(path.join(t.heroDir, 'plate-000.png')); queue(t, 3)
    await edit(t)
    expect(kinds(t).slice(5)).toEqual(['plate', 'edit', 'klein'])
  })

  it('refuses before the plate when the day budget cannot hold every job', async () => {
    const t = ready({ cap: 20 })
    const r = await edit(t)
    expect(r.status).toBe(429)
    expect([t.jobs.submits, intents(t)]).toEqual([0, []])
  })
})

describe('the free preview', () => {
  it('answers the mode\'s price, the plate state and the look frame; the depth press keeps its price', async () => {
    const t = ready()
    const a = await preview(t, { mode: 'edit' })
    expect(a).toMatchObject({ mode: 'edit', price: 28, edit: { available: true, hasPlate: false, plateUrl: null, price: 28, plateCredits: 17, seedCredits: 11, lookUrl: `/lab-assets/shots/${OTHER}/hero/${LOOK}.png` } })
    expect((await preview(t)).price).toBe(21) // today's pair
    queue(t, 3); await edit(t)
    const b = await preview(t, { mode: 'edit' })
    expect(b).toMatchObject({ price: 11, edit: { hasPlate: true, price: 11 } })
    expect(b.edit?.plateUrl).toMatch(/plate-000\.png\?v=/)
    expect((await preview(t, { mode: 'edit', count: 2 })).price).toBe(22)
    expect(t.jobs.submits).toBe(3) // the previews sent nothing
  })
  it('edit-projected is priced and described as the projected route: edit only, no plate, even before any plate exists', async () => {
    const t = ready()
    const p = await preview(t, { mode: 'edit-projected' })
    expect(p).toMatchObject({ mode: 'edit-projected', price: 11, edit: { hasPlate: true, plateCredits: 0, price: 11 } })
    expect((await preview(t, { mode: 'edit-projected', count: 2 })).price).toBe(22)
  })
  it('without a look frame it says so in plain words and still prices the press', async () => {
    const p = await preview(kitTake(), { mode: 'edit' })
    expect(p.edit).toMatchObject({ available: false, lookUrl: null, price: 28 })
    expect(p.edit?.why).toMatch(/Approve a first frame of another shot/)
  })
})

describe('scripts/hero/empty_depth.py', () => {
  const cv = (() => { try { execFileSync('python', ['-c', 'import cv2, numpy'], { stdio: 'ignore' }); return true } catch { return false } })()
  it.skipIf(!cv)('takes the hero out of the depth and keeps the pieces', () => {
    const t = ready(), dir = t.heroDir
    const d = new PNG({ width: 192, height: 108 })
    for (let y = 0; y < 108; y++) for (let x = 0; x < 192; x++) {
      const v = x >= 60 && x < 90 && y >= 30 && y < 100 ? 250 : x >= 120 && x < 150 && y >= 60 && y < 100 ? 180 : 40, i = (y * 192 + x) * 4
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255
    }
    writeFileSync(path.join(dir, 'd.png'), PNG.sync.write(d))
    execFileSync('python', [path.join(APP, 'scripts', 'hero', 'empty_depth.py'), '--depth', path.join(dir, 'd.png'), '--id', path.join(t.clayDir, 'id_000.png'), '--out', path.join(dir, 'e.png'),
      '--hero', HERO.join(','), '--keep', HIVE.join(',')])
    const o = PNG.sync.read(readFileSync(path.join(dir, 'e.png'))), at = (x: number, y: number) => o.data[(y * 192 + x) * 4]
    expect(at(75, 65)).toBeLessThan(120) // where she stood: the ground, not her
    expect(at(135, 80)).toBe(180) // the hive as it was
  })
})
