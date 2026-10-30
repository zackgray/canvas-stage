// The L2R render end to end over fakes: free refusals first, intent -> one submit -> ledger row before the wait, one at a time,
// recover by id never submits.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resetClaims } from '../../jobs/inflight.ts'
import { resetFinishing } from '../finish.ts'
import { permissiveInfo } from '../../jobs/__tests__/rig.ts'
import { l2rGraph } from '../graph.ts'
import { l2rEstimate } from '../spec.ts'
import { FRAMES, l2rJob, mount, STILL, TAKE, until, world, type World } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })
const recs = (w: World) => (existsSync(w.dirs.l2r) ? readdirSync(w.dirs.l2r).filter((f) => /^l2r-.*\.json$/.test(f)) : [])
const none = (w: World) => { expect(w.jobs.submits).toBe(0); expect(recs(w)).toEqual([]) }

describe('refusals come first and cost nothing', () => {
  it('no approved still: 409 no_still, says where to get one', async () => {
    const w = world({ still: false }); const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code]).toEqual([409, 'no_still']); expect(r.body.error).toMatch(/draw a first frame on the Stage and pick a version/i); none(w)
  })
  it('a still that is approved but not yet approved (approved: false): 409 no_still', async () => {
    const w = world({ still: { approved: false } }); const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code]).toEqual([409, 'no_still']); none(w)
  })
  it('a stale still (the take opening changed since): 409 stale_still', async () => {
    const w = world({ still: { startKey: 'deadbeef' } }); const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code]).toEqual([409, 'stale_still']); none(w)
  })
  it('a still id that is not the approved one: 409 not_approved', async () => {
    const w = world(); const r = await mount(w, w.runtime()).render({ stillId: 'still-other' })
    expect([r.status, r.body.code]).toEqual([409, 'not_approved']); none(w)
  })
  it('no clay: 409 no_clay, says where to prepare the frames', async () => {
    const w = world({ clay: false }); const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code]).toEqual([409, 'no_clay']); expect(r.body.error).toMatch(/press Draw the first frame: it prepares the frames first/); none(w)
  })
  it('clay still exporting: 409 clay_not_done; clay of an older take version: 409 clay_stale', async () => {
    const a = world({ clay: { status: 'running' } }); expect((await mount(a, a.runtime()).render()).body.code).toBe('clay_not_done'); none(a)
    const b = world({ clay: { startKey: '00000000' } }); expect((await mount(b, b.runtime()).render()).body.code).toBe('clay_stale'); none(b)
  })
  it('clay.json frames differ from the take: 409 clay_frames', async () => {
    const w = world({ clayFrames: 97 }); const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code]).toEqual([409, 'clay_frames']); none(w)
  })
  it('the clay video is longer than the take (97 on a 49-frame take): 409 before any spend', async () => {
    const w = world({ clayProbe: 97 }); const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code]).toEqual([409, 'clay_frames']); expect(r.body.error).toMatch(/longer than the take fails on Cloud/); none(w)
  })
  it('no take on disk: 404; a bad take id: 400; a path in the id: 400', async () => {
    const w = world(); const m = mount(w, w.runtime())
    expect((await m.render({ takeId: 'take-nope' })).status).toBe(404)
    expect((await m.render({ takeId: '../etc' })).status).toBe(400)
    expect((await m.render({ takeId: 'take-x/../../y' })).status).toBe(400)
    expect((await m.render({ stillId: '../x' })).status).toBe(400)
    none(w)
  })
  it('over the day budget: 429, nothing submitted, the intent removed', async () => {
    const w = world({ cap: 1 }); const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([429, 'budget', 0]); expect(recs(w)).toEqual([])
  })
  it('a self-hosted ComfyUI that does not list the LoRA: 409 no_lora before any spend; listing it (or CANVAS_L2R_LORA naming a listed one) lets it through', async () => {
    const infoWith = (names: string[]) => ({ ...permissiveInfo(l2rGraph({ prompt: 'p', seed: 1, frames: 9, prefix: 'x', layoutSize: { w: 1280, h: 720 } })),
      LTXICLoRALoaderModelOnly: { input: { required: { model: ['*'], strength_model: ['*'], lora_name: [names] } }, output: ['*', '*'] } }) as never
    const a = world(); process.env.COMFY_BASE_URL = 'http://127.0.0.1:8188'
    const r = await mount(a, a.runtime({ fetchInfo: async () => infoWith(['other.safetensors']) })).render()
    expect([r.status, r.body.code]).toEqual([409, 'no_lora']); expect(r.body.error).toMatch(/does not list/); none(a)
    process.env.CANVAS_L2R_LORA = 'mine.safetensors'
    try {
      const b = world(); const ok = await mount(b, b.runtime({ fetchInfo: async () => infoWith(['mine.safetensors']) })).render()
      expect([ok.status, ok.body.error]).toEqual([200, undefined]); expect(b.jobs.submits).toBe(1)
      expect(Object.values(b.submitted[0].json).some((n) => n.inputs.lora_name === 'mine.safetensors')).toBe(true)
    } finally { delete process.env.CANVAS_L2R_LORA }
  })
  it('no Comfy target: 503 no_target', async () => {
    const w = world(); delete process.env.COMFY_BASE_URL; delete process.env.COMFY_API_KEY
    const r = await mount(w, w.runtime(), {}, {}).render()
    expect([r.status, r.body.code]).toEqual([503, 'no_target']); none(w)
  })
})

describe('a render', () => {
  it('writes the intent, submits once with the ledger row before the wait, files raw and json, then finishes for free', async () => {
    const w = world(); const m = mount(w, w.runtime())
    const r = await m.render()
    expect(r.status).toBe(200)
    expect(w.order).toEqual(['submit intent:1', 'ledger-before-submit:false', 'wait ledger:true'])
    expect(w.jobs.submits).toBe(1)
    const rec = r.body.render
    expect(rec).toMatchObject({ takeId: TAKE, stillId: STILL, status: 'done', seed: 42, frames: FRAMES, jobId: expect.any(String), clay: `/lab-assets/shots/${TAKE}/clay/clay.mp4` })
    expect(rec.raw).toBe(`/lab-assets/shots/${TAKE}/l2r/${rec.id}-raw.mp4`)
    expect(rec.prompt).toMatch(/a burning wooden palisade/) // stage-only plan, section 5: the world's words go whole, fire words included
    const g = w.submitted[0].json
    expect(g.p0.inputs.text).toBe(rec.prompt)
    expect(g.e_t.inputs.length).toBe(FRAMES)
    expect(existsSync(path.join(w.dirs.l2r, `${rec.id}-raw.mp4`))).toBe(true)
    await until(() => JSON.parse(readFileSync(path.join(w.dirs.l2r, `${rec.id}.json`), 'utf8')).finished !== null)
    expect(w.py.calls.map((c) => path.basename(c[1]))).toEqual(['sharpen.py', 'grain.py'])
    expect(w.py.calls[1].slice(-2)).toEqual(['2.4', '24'])
    const st = (await m.status()).body
    expect(st.renders[0]).toMatchObject({ id: rec.id, finished: `/lab-assets/shots/${TAKE}/l2r/${rec.id}-finished.mp4` })
  })
  it('sends a clean prompt override as typed, and a chosen seed', async () => {
    const w = world(); const r = await mount(w, w.runtime()).render({ prompt: '  My own words.  ', seed: 7 })
    expect(r.body.render).toMatchObject({ prompt: 'My own words.', seed: 7 })
    expect(w.submitted[0].json.p0.inputs.text).toBe('My own words.'); expect(w.submitted[0].json.nz2_t.inputs.noise_seed).toBe(7)
  })
  it('a pasted override is sent verbatim, fire and grain words included (owner decision 1; the warnings say what they do)', async () => {
    const w = world(); const r = await mount(w, w.runtime()).render({ prompt: 'A soldier on a ridge at dusk, lit by the campfire, warm film grain, sparks rising' })
    expect(r.status).toBe(200)
    expect(w.submitted[0].json.p0.inputs.text).toBe('A soldier on a ridge at dusk, lit by the campfire, warm film grain, sparks rising')
    expect(r.body.render.prompt).toBe('A soldier on a ridge at dusk, lit by the campfire, warm film grain, sparks rising')
  })
  it('an override of nothing but banned words is no longer refused: it goes as typed', async () => {
    const w = world(); const r = await mount(w, w.runtime()).render({ prompt: 'a roaring bonfire, Kodak film grain' })
    expect(r.status).toBe(200)
    expect(w.submitted[0].json.p0.inputs.text).toBe('a roaring bonfire, Kodak film grain')
  })
  it('a raw that is not this job (wrong frames) is a 422, kept, not done', async () => {
    const w = world({ rawFacts: { width: 1920, height: 1088, frames: 97 } }); const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code]).toEqual([422, 'bad_output'])
    expect(JSON.parse(readFileSync(path.join(w.dirs.l2r, recs(w)[0]), 'utf8')).status).toBe('failed')
  })
})

describe('one at a time', () => {
  it('a second render while one runs: 409 busy, one submit', async () => {
    const w = world(); let open!: () => void
    const held = new Promise<void>((r) => { open = r })
    w.queue.push(l2rJob('bbbbbbbb-0000-4000-8000-000000000701', () => held))
    const m = mount(w, w.runtime())
    const first = m.render()
    await until(() => w.jobs.submits === 1)
    const second = await m.render()
    expect([second.status, second.body.code]).toEqual([409, 'busy'])
    expect((await m.status()).body.running).toMatchObject({ what: expect.stringContaining(TAKE) })
    expect(w.jobs.submits).toBe(1)
    open(); expect((await first).status).toBe(200)
    expect((await m.status()).body.running).toBeNull()
  })
})

describe('recovery never submits', () => {
  it('a lost wait: the record keeps the job id, recover by id files it and finishes, no second submit', async () => {
    const w = world(); const JOB = 'bbbbbbbb-0000-4000-8000-000000000703'
    w.queue.push(l2rJob(JOB, async () => { throw new Error('connection lost') }))
    const m = mount(w, w.runtime({ getJob: async () => l2rJob(JOB) }))
    const r = await m.render()
    expect(r.status).toBeGreaterThanOrEqual(500); expect(r.body.error).toMatch(/do not resubmit/i)
    const lost = (await m.status()).body.renders[0]
    expect(lost).toMatchObject({ status: 'failed', jobId: JOB })
    const rec = await m.recover(JOB)
    expect(rec.status).toBe(200); expect(rec.body.render).toMatchObject({ status: 'done', jobId: JOB, id: lost.id })
    expect(w.jobs.submits).toBe(1)
    await until(() => w.py.calls.length === 2)
  })
  it('an unknown job id: 404 and nothing submitted; a bad id: 400', async () => {
    const w = world(); const m = mount(w, w.runtime({ getJob: async () => { throw new Error('must not fetch') } }))
    expect((await m.recover('cccccccc-0000-4000-8000-000000000001')).status).toBe(404)
    expect((await m.recover('../../x')).status).toBe(400)
    expect(w.jobs.submits).toBe(0)
  })
})

describe('status', () => {
  it('lists what the take has and lacks, the built prompt and the price', async () => {
    const w = world({ still: false }); const st = (await mount(w, w.runtime()).status()).body
    expect(st.take.id).toBe(TAKE); expect(st.clay.status).toBe('done'); expect(st.still).toBeNull()
    expect(st.missing.map((x: { code: string }) => x.code)).toEqual(['no_still'])
    expect(st.estimate).toMatchObject({ frames: FRAMES, credits: l2rEstimate(FRAMES).credits })
    expect(st.prompt).toMatch(/battlefield/); expect(st.prompt).toMatch(/orange firelight/) // nothing is scrubbed from the world's words (stage-only plan, section 5)
  })
  it('an unknown or bad take', async () => {
    const w = world(); const m = mount(w, w.runtime())
    expect((await m.status('take-none')).body.missing[0].code).toBe('no_take')
    expect((await m.status('..%2F..')).status).toBe(400)
  })
  it('a foreign page cannot POST', async () => {
    const w = world(); const m = mount(w, w.runtime())
    expect((await m.post('/', { takeId: TAKE, stillId: STILL }, { 'content-type': 'application/json', origin: 'http://evil.example' })).status).toBe(403)
    expect(w.jobs.submits).toBe(0)
    writeFileSync(path.join(w.root, 'x'), '') // keep the temp dir referenced
  })
})
