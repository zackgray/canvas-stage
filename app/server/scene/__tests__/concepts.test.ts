// Scene's concept candidates over the fake Cloud: ONE job for N images, the price up front and rounded up, the intent on disk before
// the job, refusals before any spend (bad input, no target, the day budget, busy), the draft arm on the Lightning LoRA, and a billed
// job whose images never landed reported and completed by id, never resent.
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import { afterEach, describe, expect, it } from 'vitest'
import { CONCEPT_CR, conceptCredits, type ConceptResponse, type ConceptStatus } from '../../../src/shared/sceneContract.ts'
import type { ApiGraph } from '../../comfy/index.ts'
import { permissiveInfo, rig as jobRig } from '../../jobs/__tests__/rig.ts'
import { exclusive, resetClaims } from '../../jobs/inflight.ts'
import { buildConceptGraph, conceptPrompt, conceptSize, QWEN_LIGHTNING_4 } from '../conceptGraph.ts'
import { conceptDir, conceptRuns } from '../concepts.ts'
import { handleScene, sceneCtx } from '../plugin.ts'

afterEach(() => resetClaims())

function setup(o: { cap?: number | null; configured?: boolean; download?: boolean } = {}) {
  const pub = path.join(mkdtempSync(path.join(tmpdir(), 'scene-')), 'public')
  const jobs = jobRig({ cap: o.cap === undefined ? 100 : o.cap })
  const sent: ApiGraph[] = []
  let n = 0
  const job = (): Job => ({
    id: `aaaaaaaa-0000-4000-8000-0000000007${String(++n).padStart(2, '0')}`, status: 'succeeded', metrics: { execution_ms: 9000 }, wait: async () => {},
    getOutputs: (node: string) => (node.startsWith('s') ? [{ name: 'concept_00001_.png', toFile: async (p: string) => { if (o.download === false) throw new Error('download failed'); writeFileSync(p, 'png') } }] : []),
  }) as unknown as Job
  const info = permissiveInfo({ ...buildConceptGraph({ prompt: 'x', seeds: [1], quality: 'draft', kind: 'prop', prefix: 'p' }) })
  const rt = jobs.restart({ submit: async (wf) => { jobs.submits++; sent.push((wf as unknown as { json: ApiGraph }).json); return job() }, fetchInfo: async () => info })
  const ctx = sceneCtx({}, { publicDir: pub, runtime: () => rt, now: () => new Date('2026-10-24T10:00:00Z'), seed: () => 1000, configured: () => o.configured !== false })
  const post = (body: unknown) => handleScene(ctx, 'POST', '/concepts', new URLSearchParams(), body)
  const get = (sub = '', q: Record<string, string> = {}) => handleScene(ctx, 'GET', `/concepts${sub}`, new URLSearchParams(q), null)
  return { pub, jobs, rt, sent, post, get }
}
const LOC = { kind: 'location', description: 'A ruined hamlet in a pine forest', lighting: 'Low dusk sun, orange fire glow.', materials: 'Wet mud, charred wood.', count: 2, quality: 'full' }

describe('POST /__lab/scene/concepts', () => {
  it('two location candidates are ONE job of two samplers; the intent is on disk; urls and price come back', async () => {
    const s = setup()
    const r = await s.post(LOC)
    expect(r.status).toBe(200)
    const b = r.body as ConceptResponse
    expect(s.jobs.submits).toBe(1)
    expect(b.urls).toEqual([1, 2].map((k) => `/lab-assets/scene/default/concepts/${b.runId}/c-${k}.png`))
    expect(b.estimate).toBe(conceptCredits('full', 2))
    const g = s.sent[0]
    expect(Object.keys(g).filter((k) => /^k\d$/.test(k))).toEqual(['k0', 'k1'])
    expect(g.k0.inputs).toMatchObject({ steps: 50, cfg: 4, sampler_name: 'euler', scheduler: 'simple' })
    expect(g.lat.inputs).toMatchObject({ width: 1664, height: 928 })
    expect(g.lora).toBeUndefined()
    expect(String(g.pos.inputs.text)).toMatch(/wide establishing view of a ruined hamlet in a pine forest, with no people in it\. Low dusk sun, orange fire glow\. Wet mud, charred wood\./)
    const dir = conceptDir(s.pub, 'default', b.runId)
    expect(readdirSync(dir).sort()).toEqual(['c-1.png', 'c-2.png', 'intent.json', 'result.json'])
    expect(JSON.parse(readFileSync(path.join(dir, 'intent.json'), 'utf8'))).toMatchObject({ kind: 'location', estimate: conceptCredits('full', 2), seeds: [1000, 8919] })
    expect(s.jobs.ledger()).toMatch(/scene-concept default c-20261024100000-\w{4} .*submitted.*scene location concepts x2 \(full, 31 cr estimated\)/)
  })
  it('draft: the Lightning 4-step LoRA at CFG 1, under half the price', async () => {
    const s = setup()
    const b = (await s.post({ ...LOC, quality: 'draft' })).body as ConceptResponse
    const g = s.sent[0]
    expect(g.lora.inputs).toMatchObject({ lora_name: QWEN_LIGHTNING_4, model: ['unet', 0] })
    expect(g.ms.inputs.model).toEqual(['lora', 0])
    expect(g.k1.inputs).toMatchObject({ steps: 4, cfg: 1 })
    expect(b.estimate).toBe(conceptCredits('draft', 2))
    expect(CONCEPT_CR.draft * 2).toBeLessThanOrEqual(CONCEPT_CR.full)
  })
  it('group = one sheet of varied extras on black; prop = a flat-lit upright reference on its 3:4 bucket', async () => {
    expect(conceptPrompt('group', { description: 'Ragged peasants with tools', lighting: 'Dusk.' })).toMatch(/seven different extras.*plain flat black background.*ragged peasants with tools\..*varied faces/)
    expect(conceptPrompt('group', { description: 'x', lighting: 'Dusk sun.' })).not.toMatch(/Dusk sun/)
    expect(conceptPrompt('prop', { description: 'A @sword with a wheel pommel', lighting: 'Fire glow.' })).toMatch(/^A product photograph of a sword with a wheel pommel, seen flat on .*no hand, nothing else in the picture\./)
    // the writer's own angle and light win over the defaults
    const car = conceptPrompt('prop', { description: 'An open-wheel race car in side view. Bright overhead track lights glint off the panels, deep shadow across the wings.' })
    expect(car).not.toMatch(/flat on from the front|no shadows/)
    expect(car).toMatch(/no hand, nothing else in the picture/)
    const s = setup()
    await s.post({ kind: 'prop', description: 'A longsword', count: 1, quality: 'draft' })
    expect(s.sent[0].lat.inputs).toMatchObject({ width: 1104, height: 1472 })
    expect(conceptSize('prop', 'An open-wheel race car in side view')).toEqual({ width: 1472, height: 1104 }) // side-on = landscape
    // (prop-side-view) every side phrasing the words test reads, and a side view typed in the View box, draws landscape too
    for (const w of ['in side profile', 'side profile', 'seen from the side', 'side-on'])
      expect(conceptSize('prop', conceptPrompt('prop', { description: `A race car, ${w}.` }))).toEqual({ width: 1472, height: 1104 })
    expect(conceptSize('prop', conceptPrompt('prop', { description: 'A race car.', parts: { view: 'profile' } }))).toEqual({ width: 1472, height: 1104 })
    expect(conceptSize('prop', conceptPrompt('prop', { description: 'A sword' }))).toEqual({ width: 1104, height: 1472 }) // the default stays upright
  })
  it("(prop-edits-hold) a prop's edited parts reach the draw: the sampler gets exactly the words the page's line shows", async () => {
    const s = setup()
    const description = 'An open-wheel single-seater race car with wide slick tyres.'
    const parts = { view: 'seen from the side, in side profile' }
    expect((await s.post({ kind: 'prop', description, parts, count: 1, quality: 'draft' })).status).toBe(200)
    expect(s.sent[0].pos.inputs.text).toBe(conceptPrompt('prop', { description, parts }))
    expect(String(s.sent[0].pos.inputs.text)).toMatch(/in side profile, a strict side profile/)
    expect(s.sent[0].lat.inputs).toMatchObject({ width: 1472, height: 1104 })
  })
  it('refusals before any spend: bad input 400, no target 503, the day budget 429 (no intent left), busy 409', async () => {
    const s = setup()
    for (const bad of [{ ...LOC, kind: 'person' }, { ...LOC, count: 5 }, { ...LOC, count: 0 }, { ...LOC, description: '' }, { ...LOC, quality: 'best' }, { ...LOC, project: '../x' }, { ...LOC, lighting: 'x'.repeat(401) }]) {
      expect((await s.post(bad)).status).toBe(400)
    }
    expect((await setup({ configured: false }).post(LOC)).status).toBe(503)
    const poor = setup({ cap: 20 })
    const r = await poor.post(LOC)
    expect(r.status).toBe(429)
    expect(conceptRuns(poor.pub, 'default')).toEqual([])
    let release!: () => void
    const held = new Promise<void>((res) => { release = res })
    const first = exclusive('cast', 'a Cast job', s.rt.store, () => false, () => held)
    const busy = await s.post(LOC)
    expect(busy.status).toBe(409)
    expect(String((busy.body as { error: string }).error)).toMatch(/another paid job is running: a Cast job/)
    release(); await first
    expect(s.jobs.submits + poor.jobs.submits).toBe(0)
  })
  it('a billed job whose images did not land: 502 with the job id, reported by GET, completed by id, never resent', async () => {
    const s = setup({ download: false })
    const r = await s.post({ ...LOC, quality: 'draft' })
    expect(r.status).toBe(502)
    const jobId = (r.body as { jobId: string }).jobId
    const st = (await s.get()).body as ConceptStatus
    expect(st.prices).toEqual(CONCEPT_CR)
    expect(st.unrecovered).toEqual([expect.objectContaining({ jobId })])
    const runId = st.unrecovered[0].runId
    expect((r.body as { runId?: string }).runId).toBe(runId) // the tile can recover it without the status (m3)
    expect((await s.get('/run', { id: runId })).status).toBe(409)
    // what POST /__lab/jobs/recover does: the record's targets get the files
    const rec = s.rt.store.byJobId(jobId)!
    for (const t of Object.values(rec.outputs)) writeFileSync(path.join(t.dir, `${t.name}.png`), 'png')
    s.rt.store.save({ ...rec, status: 'done', costCredits: 2 })
    const done = await s.get('/run', { id: runId })
    expect(done.status).toBe(200)
    expect(done.body).toMatchObject({ runId, jobId, credits: 2, urls: [expect.stringMatching(/c-1\.png$/), expect.stringMatching(/c-2\.png$/)] })
    expect(((await s.get()).body as ConceptStatus).unrecovered).toEqual([])
    expect(existsSync(path.join(conceptDir(s.pub, 'default', runId), 'result.json'))).toBe(true)
    expect(s.jobs.submits).toBe(1)
  })
})
