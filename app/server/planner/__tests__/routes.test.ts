// The planner's money path over the fake Cloud: one job per call, ONE retry quoting the validator, refusals before any spend,
// intents before the job, a billed job whose answers never landed recovered by id (never resent), and no invalid plan on disk.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DevelopResponse, FleshResponse, PlannerStatus, PlanResponse } from '../../../src/shared/bibleContract.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { runJobs } from '../finalize.ts'
import { BAD_PLAN, BRIEF, GOOD_PLAN, setup, UGLY_PLAN } from './rig.ts'

afterEach(() => resetClaims())
const runDir = (pub: string, runId: string) => path.join(pub, 'lab-assets', 'planner', runId)

describe('POST /__lab/planner/plan', () => {
  it('a batch is ONE job; a valid answer is a plan on disk; the price is cold + per plan', async () => {
    const s = setup()
    s.answers.push({ p0: GOOD_PLAN, p1: `\`\`\`json\n${GOOD_PLAN}\n\`\`\`` })
    const r = await s.call('/plan', { prompts: ['A ruined hamlet at dusk.', 'A night camp.'] })
    expect(r.status).toBe(200)
    const b = r.body as PlanResponse
    expect(s.jobs.submits).toBe(1)
    expect(b.scenes.map((x) => [x.attempts, x.repaired, !!x.plan])).toEqual([[1, false, true], [1, false, true]])
    expect(b.jobIds).toHaveLength(1)
    expect(b).not.toHaveProperty('retried')
    const dir = runDir(s.pub, b.runId)
    expect(readdirSync(dir).sort()).toEqual(['intent.json', 'p0.txt', 'p1.txt', 'plan-p0.json', 'plan-p1.json', 'result.json'])
    expect(JSON.parse(readFileSync(path.join(dir, 'intent.json'), 'utf8'))).toMatchObject({ kind: 'plan', estimateCredits: 5, items: [{ key: 'p0' }, { key: 'p1' }] })
    const g = s.submitted[0].json
    expect(g.clip.inputs).toMatchObject({ clip_name: 'gemma4_e4b_it_fp8_scaled.safetensors', type: 'stable_diffusion' })
    expect(g.g_p0.inputs).toMatchObject({ max_length: 1100, 'sampling_mode.temperature': 0.5, 'sampling_mode.top_k': 40, system_prompt: ['sys', 0], prompt: 'A ruined hamlet at dusk.' })
    expect(String(g.sys.inputs.value)).toMatch(/You design a 3D film set[\s\S]*## Output format/)
    expect(s.jobs.ledger()).toMatch(/planner plan pl-20261024090000-\w{4} \(2 answers, 5 cr estimated\)/)
    expect(((await s.get()).body as PlannerStatus).prices).toMatchObject({ single: 4, cold: 3, perItem: 1 })
  })
  it('a failed answer gets ONE retry job that quotes the errors; only the failed one is retried', async () => {
    const s = setup()
    s.answers.push({ p0: BAD_PLAN, p1: GOOD_PLAN }, { p0: GOOD_PLAN })
    const b = (await s.call('/plan', { prompts: ['A', 'B'] })).body as PlanResponse
    expect(s.jobs.submits).toBe(2)
    expect(Object.keys(s.submitted[1].json).filter((k) => k.startsWith('g_'))).toEqual(['g_p0'])
    expect(s.userOf(1, 'p0')).toMatch(/^A\n\nYour previous answer:[\s\S]*Your plan was rejected: kit\[0\]\.args\[0\] \(length\): 99 is outside 1\.\.40/)
    expect(b.scenes.map((x) => [x.attempts, !!x.plan])).toEqual([[2, true], [1, true]])
    // the retry billed its own row: the response says so with what the retry alone cost (the price line shows it)
    const r2 = b as PlanResponse & { retried?: boolean; retryCredits?: number | null }
    expect(r2.retried).toBe(true); expect(r2.retryCredits).toBeNull() // the fake Cloud measures no balance
    for (const rec of s.rt.store.list()) s.rt.store.save({ ...rec, costCredits: rec.label.endsWith(' retry') ? 1.1 : 1.6 })
    expect(runJobs(s.rt.store, b.runId)).toMatchObject({ retried: true, retryCredits: 1.1, credits: 2.7 })
    expect(existsSync(path.join(runDir(s.pub, b.runId), 'p0-retry.txt'))).toBe(true)
  })
  it('still invalid after the retry: repaired when repairPlan can, else 422 and NO plan file', async () => {
    const s = setup()
    s.answers.push({ p0: UGLY_PLAN, p1: 'not json' }, { p0: UGLY_PLAN, p1: 'still not json' })
    const r = await s.call('/plan', { prompts: ['A', 'B'] })
    const b = r.body as PlanResponse
    expect(r.status).toBe(200)
    expect(b.scenes.map((x) => [x.attempts, x.repaired, !!x.plan])).toEqual([[2, true, true], [2, false, false]])
    expect(b.scenes[1].errors.join(' ')).toMatch(/not valid JSON/)
    const files = readdirSync(runDir(s.pub, b.runId))
    expect(files).toContain('plan-p0.json'); expect(files).not.toContain('plan-p1.json')
    const one = setup()
    one.answers.push({ p0: 'nope' }, { p0: 'nope' })
    const r1 = await one.call('/plan', { prompt: 'A' })
    expect(r1.status).toBe(422)
    expect(readdirSync(runDir(one.pub, (r1.body as PlanResponse).runId)).some((f) => f.startsWith('plan-'))).toBe(false)
  })
  it('the plan guard: the store refuses to write a plan parsePlan rejects', () => {
    const s = setup()
    const store = s.ctx.store, runId = store.newRunId(new Date('2026-10-24T09:00:00Z'))
    store.writeIntent({ runId, kind: 'plan', request: { prompts: ['A'] }, items: [{ key: 'p0', user: 'A' }], seed: 1, estimateCredits: 3, createdAt: 't' })
    const raw = JSON.parse(BAD_PLAN)
    expect(() => store.writePlan(runId, 'p0', { ...raw, sky: { url: '/lab-assets/x.png' } })).toThrow(/invalid plan/)
    expect(existsSync(path.join(runDir(s.pub, runId), 'plan-p0.json'))).toBe(false)
  })
  it('refusals before any spend: bad input 400, no Comfy target 503, the day budget 429 (no intent left), busy 409', async () => {
    const s = setup()
    expect((await s.call('/plan', { prompts: [] })).status).toBe(400)
    expect((await s.call('/plan', { prompts: Array(9).fill('x') })).status).toBe(400)
    expect((await s.call('/develop', { idea: 'x', mode: 'loud' })).status).toBe(400)
    expect((await setup({ configured: false }).call('/plan', { prompt: 'A' })).status).toBe(503)
    const poor = setup({ cap: 2 })
    expect((await poor.call('/plan', { prompt: 'A' })).status).toBe(429)
    expect(poor.jobs.submits).toBe(0)
    expect(existsSync(path.join(poor.pub, 'lab-assets', 'planner')) ? readdirSync(path.join(poor.pub, 'lab-assets', 'planner')) : []).toEqual([])
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    s.answers.push({ p0: GOOD_PLAN })
    const first = (await import('../../jobs/inflight.ts')).exclusive('planner', 'held', s.rt.store, () => false, () => held)
    expect((await s.call('/plan', { prompt: 'A' })).status).toBe(409)
    release(); await first
    expect(s.jobs.submits).toBe(0)
  })
  it('a billed job whose answers did not land: 502 with the job id; the run is completed by id, never resent', async () => {
    const s = setup({ download: false })
    s.answers.push({ p0: GOOD_PLAN })
    const r = await s.call('/plan', { prompt: 'A' })
    expect(r.status).toBe(502)
    const jobId = (r.body as { jobId: string }).jobId
    expect(jobId).toMatch(/^aaaaaaaa-/)
    const st = (await s.get()).body as PlannerStatus
    expect(st.unrecovered).toEqual([expect.objectContaining({ jobId })])
    const runId = st.unrecovered[0].runId
    expect((await s.get('/run', { id: runId })).status).toBe(409)
    // what POST /__lab/jobs/recover does: the record's targets get the files, the record is done
    const rec = s.rt.store.byJobId(jobId)!
    writeFileSync(path.join(runDir(s.pub, runId), 'p0.txt'), GOOD_PLAN)
    s.rt.store.save({ ...rec, status: 'done' })
    const done = await s.get('/run', { id: runId })
    expect(done.status).toBe(200)
    expect((done.body as PlanResponse).scenes[0].plan).toBeTruthy()
    expect(s.jobs.submits).toBe(1)
  })
})

describe('POST /__lab/planner/develop and /flesh', () => {
  it('develop: the idea and mode go in the user message; the brief comes back with the support check applied', async () => {
    const s = setup()
    const rider = { ...BRIEF, elements: [...BRIEF.elements, { name: 'Rider', tag: 'rider', type: 'person', look: 'a man on horseback', supported: true }],
      brief: `${BRIEF.brief} @rider waits.` }
    s.answers.push({ brief: JSON.stringify(rider) })
    const r = await s.call('/develop', { idea: 'soldier walks out of the smoke, a rider waits', mode: 'light' })
    expect(r.status).toBe(200)
    const b = r.body as DevelopResponse
    expect(s.userOf(0, 'brief')).toBe('MODE: light\nIDEA: soldier walks out of the smoke, a rider waits')
    expect(String(s.submitted[0].json.sys.inputs.value)).toMatch(/You develop a film scene/)
    expect(b.brief?.elements.find((e) => e.tag === 'rider')?.supported).toBe(false)
    expect(b.brief?.warnings[0]).toMatchObject({ element: 'Rider' })
    expect(b.brief?.background).toMatch(/far behind him/)
  })
  it('develop: invalid twice is a 422 with the errors, no brief', async () => {
    const s = setup()
    s.answers.push({ brief: JSON.stringify({ ...BRIEF, beats: [] }) }, { brief: JSON.stringify({ ...BRIEF, beats: ['a'] }) })
    const r = await s.call('/develop', { idea: 'x', mode: 'full' })
    expect(r.status).toBe(422)
    expect(s.userOf(1, 'brief')).toMatch(/Your brief was rejected: beats: required list of 3 or 4/)
    expect(r.body).toMatchObject({ brief: null, attempts: 2, errors: [expect.stringMatching(/beats/)] })
    expect((await s.get('/run', { id: (r.body as DevelopResponse).runId })).status).toBe(422)
  })
  it('an answer that fails both tries (422) bills two jobs and counts both: the response, the day budget and the job store agree', async () => {
    const s = setup()
    s.answers.push({ brief: JSON.stringify({ ...BRIEF, beats: [] }) }, { brief: JSON.stringify({ ...BRIEF, beats: ['a'] }) })
    const r = await s.call('/develop', { idea: 'x', mode: 'full' })
    const b = r.body as DevelopResponse
    expect(r.status).toBe(422)
    expect(s.jobs.submits).toBe(2)
    expect(b.jobIds).toHaveLength(2)
    // the fake Cloud measures nothing, so each job counts at its estimate (4): two jobs, 8
    expect(b.spentCredits).toBe(8)
    expect(s.rt.budget.spentToday()).toBe(8)
    expect(s.rt.store.list().filter((x) => x.label.startsWith('planner develop') && x.jobId)).toHaveLength(2)
    expect(b).toMatchObject({ retried: true })
    // a recovered/reread 422 says the same
    expect(((await s.get('/run', { id: b.runId })).body as DevelopResponse).spentCredits).toBe(8)
  })
  it('a 200 that needed no retry counts one job', async () => {
    const s = setup()
    s.answers.push({ p0: GOOD_PLAN })
    const b = (await s.call('/plan', { prompt: 'A' })).body as PlanResponse
    expect(b.spentCredits).toBe(4)
    expect(s.rt.budget.spentToday()).toBe(4)
  })
  it('flesh: one character description', async () => {
    const s = setup()
    s.answers.push({ flesh: '{"description":"A woman in her thirties, lean, short dark hair, dented helmet, grey gambeson, muddy boots."}' })
    const r = await s.call('/flesh', { name: 'Ana', description: 'a tired soldier', scene: 'a battlefield at dusk' })
    expect(r.status).toBe(200)
    expect((r.body as FleshResponse).description).toMatch(/dented helmet/)
    expect(s.userOf(0, 'flesh')).toBe('NAME: Ana\nDESCRIPTION: a tired soldier\nSCENE: a battlefield at dusk')
  })
})
