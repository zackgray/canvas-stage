// Join (A1 x B): POST /__lab/bible/master draws with B's depth-locked Qwen graph on the master view's depth (captured at set
// build), appends the candidates, and refuses for free with no depth or an unknown tag. Fake Cloud: no network, no credits.
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import type { Job } from '@comfyorg/sdk'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { kitInfo, pngJob, stillPng, zdepthPng } from '../../hero/__tests__/kitRig.ts'
import { world } from '../../hero/__tests__/rig.ts'
import { FILES, KitStore } from '../../stage3d/store.ts'
import { masterCredits } from '../../hero/master.ts'
import { masterCamera, masterCameraWords, masterDrawer, masterPrompt } from '../masterDraw.ts'
import { previewMaster } from '../masterPreview.ts'
import { completeMasters } from '../masterIntents.ts'
import { handleBible } from '../routes.ts'
import { BibleStore } from '../store.ts'
import { approveSetOnDisk } from './approveFixture.ts'

afterEach(() => resetClaims())

function setup(o: { depth?: boolean; approved?: boolean } = {}) {
  const w = world()
  const kit = new KitStore(w.pub).create({ plan: BATTLEFIELD, description: 'master draw test' })
  if (o.approved !== false) approveSetOnDisk(w.pub, kit.id)
  if (o.depth !== false) writeFileSync(path.join(w.pub, 'lab-assets', 'locations', kit.id, FILES.masterDepth), zdepthPng())
  const store = new BibleStore(w.pub)
  const rt = w.runtime({ fetchInfo: async () => kitInfo() })
  const draw = masterDrawer({ publicDir: w.pub, store, runtime: () => rt, seed: () => 100, now: () => new Date('2026-10-26T10:00:00Z') })
  const ctx = { store, drawMaster: draw, complete: (id: string) => completeMasters(w.pub, store, rt.store, id) }
  const call = (sub: string, body: object) => handleBible(ctx, 'POST', sub, new URLSearchParams(), { worldId: kit.id, ...body })
  const get = () => handleBible(ctx, 'GET', '', new URLSearchParams({ world: kit.id }), null)
  return { w, kit, store, call, get, rt }
}
type Sent = { json: Record<string, { class_type: string; inputs: Record<string, unknown> }> }

describe('the Bible master draw', () => {
  it('one Qwen job of two seeds on the master depth, on the recipe (photograph prompt, photographic lock); candidates appended (never approved by the draw)', async () => {
    const { w, kit, call } = setup()
    await call('', { prompt: 'A burnt village at dawn', lighting: 'low cold sun from the left', materials: 'wet mud, weathered wood' })
    w.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000c01', stillPng()))
    const r = await call('/master', { count: 2 })
    expect(r.status).toBe(200)
    const b = (r.body as { bible: BibleRecord }).bible
    expect(w.jobs.submits).toBe(1)
    const sent = (w.submitted[0] as Sent).json
    expect(Object.values(sent).filter((n) => n.class_type === 'KSampler').map((n) => n.inputs.seed)).toEqual([100, 8019])
    // tidy wave: the still's photographic lock (0.65 released at 0.50), not the pre-recipe 0.95 to the end
    expect(sent.cn.inputs).toMatchObject({ strength: 0.65, end_percent: 0.5 })
    const text = String(sent.pos.inputs.text)
    // prompt wave: the master camera's own words (its real pitch and height) and lens feel; the Bible's flat light line (no v2 brief)
    expect(text).toMatch(/^Photo of a burnt village at dawn. The place stands empty and quiet. Seen at eye height, 1\.6 metres up\. A wide-angle view with deep space\./)
    expect(text).toContain('Low cold sun from the left.')
    expect(text).not.toMatch(/Kodak|vision3|\d\s?mm\b|the only light|establishing/i) // no stock, no millimetres, no canned light or camera
    expect(text).not.toMatch(/faces?\b|Real photographic|real photograph|Deep focus|wet mud, weathered wood/i) // no person, no realism tags, no Bible lines whole
    expect(b.master).toBeNull()
    expect(b.candidates.map((c) => [c.id, c.seed, c.madeBy])).toEqual([['m-20261026100000-1', 100, 'qwen-image-2512+union-depth'], ['m-20261026100000-2', 8019, 'qwen-image-2512+union-depth']])
    for (const c of b.candidates) expect(existsSync(path.join(w.pub, ...c.png.slice(1).split('/')))).toBe(true)
    expect(b.candidates[0].png).toBe(`/${biblePaths(kit.id).master}/m-20261026100000-1.png`)
    const ok = await call('/approve', { masterId: b.candidates[1].id })
    expect((ok.body as { bible: BibleRecord }).bible.grade).toEqual({ target: b.candidates[1].png, method: 'reinhard-lab' })
  })
  it('the master is the place: a sentence naming a cast tag is left out of its prompt', () => {
    const b = { worldId: 'loc-x', version: 2, prompt: 'A burnt field at dusk. @ana walks toward us.', master: null, candidates: [], lighting: '', materials: '',
      elements: [{ tag: 'ana', kind: 'cast' as const, cardId: 'ana', refs: [], line: '' }], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't' }
    const p = masterPrompt(b, BATTLEFIELD)
    expect(p).toMatch(/burnt field at dusk/); expect(p).not.toMatch(/walks toward us/)
  })
  it('the master is the photograph of the place: the place phrase, the pieces its camera sees plainly, the flat light line, no background claims', () => {
    const b = { worldId: 'loc-x', version: 2, prompt: 'A muddy battlefield at dusk: a tall log palisade stretching to the horizon, torn tents everywhere.', master: null, candidates: [], lighting: 'low cold sun', materials: 'wet mud', elements: [],
      extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't' }
    const p = masterPrompt(b, BATTLEFIELD)
    expect(p).toMatch(/^Photo of a muddy battlefield at dusk\./); expect(p).toMatch(/In the frame: [^.]*palisade/)
    expect(p).toContain('Low cold sun.'); expect(p).not.toMatch(/wet mud\.|the only light|weathered|rock/i) // relief (rock) never named; no aged words
    expect(p).not.toMatch(/stretching|to the horizon|everywhere/)
  })
  it('the master camera sentence is its geometry (eye height, looking slightly down at 24 mm), and a v2 brief lights it with nobody in it', () => {
    const c = masterCamera()
    expect(c.position).toEqual([0, 1.6, 0]); expect(masterCameraWords(c)).toBe('Seen at eye height, 1.6 metres up.')
    expect(masterCameraWords({ ...c, position: [0, 6, 0], quaternion: [-0.3827, 0, 0, 0.9239] })).toMatch(/^Seen from high above, about 6 metres up/)
    const brief = { logline: '', place: { setting: 'a burnt village', period: '', season: 'winter', time: 'dawn', weather: '' },
      light: { key: 'a low cold sun', direction: 'behind him, towards camera', height: 'low', quality: 'hard', colour: '', others: '', effect: 'his breath glows' },
      atmosphere: [{ what: 'smoke', where: 'drifting low between the houses' }, { what: 'snow', where: 'on his shoulders' }], elements: [], beats: [],
      camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '', background: '', exclude: [], warnings: [], developed: [] }
    const b = { worldId: 'loc-x', version: 2, prompt: '', master: null, candidates: [], lighting: '', materials: '', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', brief } as unknown as BibleRecord
    const p = masterPrompt(b, BATTLEFIELD)
    expect(p).toMatch(/^Photo of a burnt village, winter, dawn. The place stands empty and quiet. Seen at eye height, 1\.6 metres up\./)
    expect(p).toMatch(/A hard low cold sun, from the far side, towards camera: every edge rimmed with light, long shadows falling towards us\./)
    expect(p).toContain('Smoke drifting low between the houses; snow.')
    expect(p).not.toMatch(/\bhis\b|\bhim\b|breath|faces?\b/i)
  })
  it('the press preview is free and composes what the draw sends; Tight and an edited prompt go as the card shows', async () => {
    const { w, kit, call, store } = setup()
    await call('', { prompt: 'A burnt village at dawn' })
    const bible = await store.get(kit.id)
    const p = await previewMaster(w.pub, store, bible, { worldId: kit.id })
    expect(p).toMatchObject({ preset: 'photographic', count: 2, price: masterCredits(2), edited: false })
    expect(p.prompt).toBe(p.composed); expect(p.prompt).toMatch(/^Photo of a burnt village at dawn\./)
    expect(p.depthUrl).toMatch(new RegExp(`^/${biblePaths(kit.id).master}/preview-master-depth\\.png\\?v=\\d+$`))
    expect(existsSync(path.join(w.pub, biblePaths(kit.id).master, 'preview-master-depth.png'))).toBe(true)
    expect(w.jobs.submits).toBe(0) // free: no Cloud call
    const edited = await previewMaster(w.pub, store, bible, { worldId: kit.id, preset: 'tight', prompt: 'Photo of a burnt village, heavy film grain. 24mm lens.' })
    expect(edited).toMatchObject({ preset: 'tight', edited: true }); expect(edited.prompt).toBe('Photo of a burnt village, heavy film grain. 24mm lens.') // decision 1: verbatim
    w.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000c02', stillPng()))
    expect((await call('/master', { count: 1, preset: 'tight', prompt: 'Photo of a burnt village, heavy film grain. 24mm lens.' })).status).toBe(200)
    const sent = (w.submitted[0] as Sent).json
    expect(sent.cn.inputs).toMatchObject({ strength: 0.95, end_percent: 1 }); expect(String(sent.pos.inputs.text)).toBe(edited.prompt)
    // the route answers it, also with no depth yet (no image, never a refusal); a bad preset is a free 400
    const none = setup({ depth: false })
    const ctx = { store: none.store, previewMaster: (b: BibleRecord | null, q: unknown) => previewMaster(none.w.pub, none.store, b, q) }
    const r = await handleBible(ctx, 'POST', '/master/preview', new URLSearchParams(), { worldId: none.kit.id, count: 1 })
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ count: 1, price: masterCredits(1), depthUrl: null })
    expect((await handleBible(ctx, 'POST', '/master/preview', new URLSearchParams(), { worldId: none.kit.id, preset: 'loose' })).status).toBe(400)
  })
  it('no master depth: 409, nothing submitted', async () => {
    const { w, call } = setup({ depth: false })
    const r = await call('/master', {})
    expect(r.status).toBe(409); expect((r.body as { error: string }).error).toMatch(/master-view depth/)
    expect(w.jobs.submits).toBe(0)
  })
  it('an @tag the Bible lacks, or a bad count: 400, nothing submitted', async () => {
    const { w, call } = setup()
    await call('', { prompt: 'a field with @ghost' })
    expect((await call('/master', {})).status).toBe(400)
    await call('', { prompt: 'a field' })
    expect((await call('/master', { count: 3 })).status).toBe(400)
    expect(w.jobs.submits).toBe(0)
  })
  it('M5: a draw whose pngs never landed (a restart, a lost download) is listed to recover; once they are on disk, GET makes them candidates', async () => {
    const { w, kit, call, get } = setup()
    await call('', { prompt: 'A burnt village at dawn' })
    // Cloud billed the job but the download failed, as when the dev server died mid-draw
    const lostJob = { id: 'aaaaaaaa-0000-4000-8000-000000000c09', status: 'succeeded', metrics: { execution_ms: 9000 }, wait: async () => {},
      getOutputs: () => [{ name: 'out.png', toFile: async () => { throw new Error('socket hang up') } }] } as unknown as Job
    w.queue.push(lostJob)
    const r = await call('/master', { count: 2 })
    expect(r.status).toBeGreaterThanOrEqual(400)
    const dir = path.join(w.pub, biblePaths(kit.id).master)
    expect(readdirSync(dir).filter((f) => f.startsWith('intent-')).length).toBe(2) // written before the spend
    const before = (await get()).body as { bible: BibleRecord; unrecovered?: { jobId: string; ids: string[] }[] }
    expect(before.bible.candidates).toEqual([])
    expect(before.unrecovered).toEqual([{ jobId: lostJob.id, ids: ['m-20261026100000-1', 'm-20261026100000-2'], since: expect.any(String) }])
    // Recover by id writes the pngs where the record says (here by hand); the next GET brings them into the Bible, priced from the record
    for (const id of before.unrecovered![0].ids) writeFileSync(path.join(dir, `${id}.png`), stillPng())
    const after = (await get()).body as { bible: BibleRecord; unrecovered?: unknown[] }
    expect(after.bible.candidates.map((c) => [c.id, c.seed, c.jobId])).toEqual([['m-20261026100000-1', 100, lostJob.id], ['m-20261026100000-2', 8019, lostJob.id]])
    expect(after.unrecovered).toBeUndefined()
    expect(readdirSync(dir).filter((f) => f.startsWith('intent-'))).toEqual([])
    expect(w.jobs.submits).toBe(1)
  })
  it('a free refusal (the day budget) leaves no intent behind', async () => {
    const { kit, call, w } = setup()
    await call('', { prompt: 'A burnt village at dawn' })
    const rt = w.runtime({ fetchInfo: async () => kitInfo() })
    rt.budget.adjust(10_000)
    const st = new BibleStore(w.pub)
    const r = await handleBible({ store: st, drawMaster: masterDrawer({ publicDir: w.pub, store: st, runtime: () => rt, seed: () => 1 }) }, 'POST', '/master', new URLSearchParams(), { worldId: kit.id })
    expect(r.status).toBe(429)
    const dir = path.join(w.pub, biblePaths(kit.id).master)
    expect(existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith('intent-')) : []).toEqual([])
  })
})
