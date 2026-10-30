// 'edit-projected' (draw-from-master arm 2): the approved master seen from the take's camera by its depth. The splat itself on real
// Python (identity = no holes), then the press on the fake Cloud: one edit job and no plate, the free refusals spend nothing.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { afterAll, describe, expect, it } from 'vitest'
import { biblePaths } from '../../../src/shared/bibleContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { heightFn } from '../../../src/stage3d/world.ts'
import { buildEditGraph } from '../editGraph.ts'
import { kitInfo, kitTake, masterOf, pngJob, stillPng, zdepthPng, type KitTake } from './kitRig.ts'
import { permissiveInfo } from '../../jobs/__tests__/rig.ts'
import { mount } from './rig.ts'

type Sent = { json: Record<string, { class_type?: string; inputs: Record<string, unknown> }> }
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCRIPT = path.join(APP, 'scripts', 'hero', 'project_master.py')
const OTHER = 'take-2026-10-22T11-00-00-000', LOOK = 'hero-2026-10-22T11-05-00-000-1'

const cv = (() => { try { execFileSync('python', ['-c', 'import cv2, numpy'], { stdio: 'ignore' }); return true } catch { return false } })()
const tmp = mkdtempSync(path.join(os.tmpdir(), 'project-master-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const holesOf = (f: string) => { const p = PNG.sync.read(readFileSync(f)); let n = 0; for (let i = 0; i < p.data.length; i += 4) if (p.data[i] > 0) n++; return n / (p.width * p.height) }
function run(name: string, takeCam: string) {
  const dir = path.join(tmp, name); mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'm.png'), stillPng(undefined, 192, 108)); writeFileSync(path.join(dir, 'z.png'), zdepthPng())
  const out = path.join(dir, 'o.png'), holes = path.join(dir, 'o-holes.png')
  execFileSync('python', [SCRIPT, '--master', path.join(dir, 'm.png'), '--zdepth', path.join(dir, 'z.png'), '--master-cam', '0,1.6,0,0,1,-8,24', '--take-cam', takeCam, '--out', out, '--holes', holes])
  return { out, holes, master: path.join(dir, 'm.png') }
}

describe.skipIf(!cv)('scripts/hero/project_master.py', () => {
  it('the master camera again is the master itself: 0% holes', () => {
    const r = run('same', '0,1.6,0,0,1,-8,24')
    expect(holesOf(r.holes)).toBe(0)
    expect(PNG.sync.read(readFileSync(r.out)).data.equals(PNG.sync.read(readFileSync(r.master)).data)).toBe(true)
  })
  it('a camera moved sideways and in sees the box from another side: some holes, not most', () => {
    const h = holesOf(run('moved', '1,1.6,-1,0,1,-8,24').holes)
    expect(h).toBeGreaterThan(0)
    expect(h).toBeLessThan(0.5)
  })
})

function info() {
  type Info = Record<string, { input: { required: Record<string, unknown>; optional?: Record<string, unknown> } }>
  const a = kitInfo() as unknown as Info, b = permissiveInfo(buildEditGraph({ prompt: 'p', seeds: [1], prefix: 'x' })) as unknown as Info
  const out: Info = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = out[k] ? { ...out[k], input: { ...out[k].input, optional: { ...v.input.required } } } : v
  return out as never
}
/** the fake runner writes the picture and its mask where asked */
const fake = (calls: string[][] = []) => ({ python: () => 'python' as string | undefined, appDir: APP, runPython: async (_p: string, args: string[]) => {
  calls.push(args)
  copyFileSync(args[args.indexOf('--master') + 1], args[args.indexOf('--out') + 1]); copyFileSync(args[args.indexOf('--master') + 1], args[args.indexOf('--holes') + 1])
} })
const hero = (t: KitTake, over = {}) => mount(t, t.runtime({ fetchInfo: async () => info() }), { ...fake(), ...over })
const queue = (t: KitTake, n: number) => { for (let i = 0; i < n; i++) t.queue.push(pngJob(`aaaaaaaa-0000-4000-8000-000000000d0${i}`, stillPng())) }
const press = (t: KitTake, body: object = {}, over = {}) => hero(t, over).render({ mode: 'edit-projected', count: 1, ...body })
const kinds = (t: KitTake) => t.submitted.map((s) => ('m1' in (s as Sent).json ? 'edit' : 'unet' in (s as Sent).json ? 'plate' : 'klein'))
const intents = (t: KitTake) => readdirSync(t.heroDir).filter((f) => f.startsWith('intent-'))
const errorOf = (r: { body: unknown }) => String((r.body as { error?: string }).error)

function ready(o: { master?: boolean; depth?: boolean; cap?: number } = {}) {
  const t = kitTake({ bible: {}, ...(o.cap ? { cap: o.cap } : {}) })
  const dir = path.join(t.pub, 'lab-assets', 'shots', OTHER, 'hero')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, '..', 'take.json'), JSON.stringify({ ...t.take, id: OTHER, lockedAt: '2026-10-22T11:00:00.000Z' }))
  writeFileSync(path.join(dir, `${LOOK}.png`), stillPng())
  writeFileSync(path.join(dir, `${LOOK}.json`), JSON.stringify({ id: LOOK, takeId: OTHER, startKey: t.take.startKey, png: '', seed: 7, jobId: 'j', credits: 21, approved: true, createdAt: '2026-10-22T11:05:00.000Z', castId: 'ana', role: 'opening' }))
  if (o.master !== false) {
    const f = path.join(t.pub, biblePaths(t.kit.id).file)
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), master: masterOf(t.kit.id) }))
  }
  if (o.depth !== false) writeFileSync(path.join(t.pub, 'lab-assets', 'locations', t.kit.id, 'master-zdepth.png'), zdepthPng())
  return t
}

describe('mode edit-projected', () => {
  it('sends one edit job and a finish, no plate; the projected picture is bound as picture 1 and the prompt says black is unseen', async () => {
    const t = ready(); queue(t, 2)
    const calls: string[][] = []
    const r = await press(t, {}, fake(calls))
    expect(r.status).toBe(200)
    expect(kinds(t)).toEqual(['edit', 'klein'])
    expect(existsSync(path.join(t.heroDir, 'plate-000.png'))).toBe(false)
    expect(existsSync(path.join(t.heroDir, 'depth-empty-000.png'))).toBe(false)
    expect(existsSync(path.join(t.heroDir, 'projected-000.png')) && existsSync(path.join(t.heroDir, 'projected-000-holes.png'))).toBe(true)
    // the master camera as the master was drawn: eye and target lifted by the terrain under each (kitStill.ts masterCamera(world.groundAt))
    const g = heightFn(BATTLEFIELD)
    expect(calls[0][calls[0].indexOf('--master-cam') + 1]).toBe([0, 1.6 + g(0, 0), 0, 0, 1 + g(0, -8), -8, 24].join(','))
    expect(String((t.submitted[0] as Sent).json.pos.inputs.prompt)).toContain('The black areas of picture 1 are unseen')
    expect((r.body as { still: object }).still).toMatchObject({ drawMode: 'edit-projected', plateId: null, lookStillId: LOOK, madeBy: expect.stringContaining('qwen-edit-2511') })
  })
  it('is priced edit-only: a day budget that cannot hold a plate still holds this press', async () => {
    const t = ready({ cap: 20 }); queue(t, 2)
    expect((await press(t)).status).toBe(200)
  })
  it.each([
    ['no approved master', { master: false }, /approved master/],
    ['no master depth', { depth: false }, /no depth recorded/],
  ])('%s: a free 409, nothing sent, no intent, no projected picture', async (_n, o, why) => {
    const t = ready(o)
    const r = await press(t)
    expect(r.status).toBe(409)
    expect(errorOf(r)).toMatch(why)
    expect([t.jobs.submits, intents(t), existsSync(path.join(t.heroDir, 'projected-000.png'))]).toEqual([0, [], false])
  })
  it('no Python: a free 409, nothing sent, no intent', async () => {
    const t = ready()
    const r = await press(t, {}, { python: () => undefined })
    expect(r.status).toBe(409)
    expect([t.jobs.submits, intents(t)]).toEqual([0, []])
  })
  it('an unknown mode is still a 400', async () => {
    expect((await press(ready(), { mode: 'edit-project' })).status).toBe(400)
  })
})
