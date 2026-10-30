// The hero-still endpoint end to end over fakes: opening upload, free refusals, intent -> job -> json order, one at a time,
// approve-one-only, path safety, recover by id. No network, no ComfyUI.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTES, shotPaths, type HeroStill } from '../../../src/shared/shotContract.ts'
import { heroJob, mount, pngBytes, takeRecord, TAKE, until, world } from './rig.ts'

const files = (dir: string) => readdirSync(dir)
const intents = (dir: string) => files(dir).filter((f) => f.startsWith('intent-'))
const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T

describe('opening upload', () => {
  it('streams a 1920x1088 PNG to hero/opening.png and records the start it is for', async () => {
    const w = world({ opening: false }); const m = mount(w, w.runtime())
    const r = await m.opening(pngBytes(), `take=${TAKE}&key=${w.take.startKey}`)
    expect([r.status, r.body.ok, r.body.startKey]).toEqual([200, true, w.take.startKey])
    expect(existsSync(path.join(w.heroDir, 'opening.png'))).toBe(true)
    expect(json<{ startKey: string }>(path.join(w.heroDir, 'opening.json')).startKey).toBe(w.take.startKey)
    expect((await m.list()).body.opening).toEqual({ present: true, startKey: w.take.startKey })
  })
  it('refuses a non-PNG, a wrong size, an older start, a bad take id and a foreign page; leaves no temp file', async () => {
    const w = world({ opening: false }); const m = mount(w, w.runtime())
    expect((await m.opening(Buffer.from('not a png at all, just text........'))).status).toBe(400)
    expect((await m.opening(pngBytes(960, 544))).body.error).toMatch(/1920x1088/)
    expect((await m.opening(pngBytes(), `take=${TAKE}&key=deadbeef`)).body.code).toBe('stale_opening')
    expect((await m.opening(pngBytes(), `take=${TAKE}&key=zz`)).status).toBe(400)
    expect((await m.opening(pngBytes(), 'take=take-nope')).status).toBe(404)
    expect((await m.opening(pngBytes(), 'take=..%2F..%2Fx')).status).toBe(400)
    expect((await m.opening(pngBytes(), `take=${TAKE}`, { 'content-type': 'image/png', origin: 'http://evil.example' })).status).toBe(403)
    expect(files(w.heroDir)).toEqual([])
  })
})

describe('free refusals spend nothing', () => {
  const none = (w: ReturnType<typeof world>) => { expect(w.jobs.submits).toBe(0); expect(intents(w.heroDir)).toEqual([]) }
  it('no cast face card: a plain 400, no intent, no job', async () => {
    for (const o of [{ cast: false }, { face: false }]) {
      const w = world(o); const r = await mount(w, w.runtime()).render()
      expect([r.status, r.body.code]).toEqual([400, 'no_cast']); expect(r.body.error).toMatch(/No cast face card/); none(w)
    }
  })
  it('no opening frame yet: 400 opening_missing; an opening for an older start: 409', async () => {
    const w = world({ opening: false }); const m = mount(w, w.runtime())
    expect((await m.render()).body.code).toBe('opening_missing')
    await m.opening(pngBytes(), `take=${TAKE}&key=${w.take.startKey}`)
    writeFileSync(path.join(w.heroDir, 'opening.json'), JSON.stringify({ startKey: 'deadbeef' }))
    expect((await m.render()).body.code).toBe('stale_opening'); none(w)
  })
  it('bad requests and unknown takes: 400 / 404', async () => {
    const w = world(); const m = mount(w, w.runtime())
    expect((await m.render({ count: 5 })).status).toBe(400)
    expect((await m.render({ seed: -1 })).status).toBe(400)
    expect((await m.render({ takeId: '../../etc' })).status).toBe(400)
    expect((await m.render({ takeId: 'take-missing' })).status).toBe(404)
    expect((await m.render({ sid: 'perf-../x' })).status).toBe(400); none(w)
  })
  it('over the day budget: 429, nothing submitted, the unspent intents are not left behind', async () => {
    const w = world({ cap: 1 }); const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code]).toEqual([429, 'budget']); none(w)
  })
  it('no Comfy target configured: 503 before anything is written', async () => {
    const w = world(); const had = process.env.COMFY_BASE_URL; delete process.env.COMFY_API_KEY; delete process.env.COMFY_BASE_URL
    const m = mount(w, w.runtime()); delete process.env.COMFY_BASE_URL
    const r = await m.render(); if (had) process.env.COMFY_BASE_URL = had
    expect([r.status, r.body.code]).toEqual([503, 'no_target']); none(w)
  })
})

describe('Render this frame', () => {
  it('goes intent -> ONE job -> png, then json last; binds the opening and the face; the ledger has the job before the wait ends', async () => {
    const w = world(); let ledgerAtWait = ''
    w.queue.push(heroJob('aaaaaaaa-0000-4000-8000-000000000801', async () => { ledgerAtWait = w.jobs.ledger() }))
    const r = await mount(w, w.runtime()).render({ seed: 42 })
    expect(r.status).toBe(200)
    expect(w.order).toEqual(['intent-on-disk:true', 'json-on-disk:false'])
    expect(ledgerAtWait).toContain('aaaaaaaa-0000-4000-8000-000000000801 | submitted')
    expect(w.jobs.submits).toBe(1)
    const s = r.body.still as HeroStill
    expect(s).toMatchObject({ takeId: TAKE, startKey: w.take.startKey, seed: 42, jobId: 'aaaaaaaa-0000-4000-8000-000000000801', approved: false, png: `/lab-assets/shots/${TAKE}/hero/${s.id}.png` })
    expect(existsSync(path.join(w.heroDir, `${s.id}.png`))).toBe(true)
    expect(json<HeroStill>(path.join(w.heroDir, `${s.id}.json`)).id).toBe(s.id)
    expect(json<HeroStill>(path.join(w.heroDir, `intent-${s.id}.json`)).jobId).toBeNull()
    expect((await mount(w, w.runtime()).list()).body.stills.map((x: HeroStill) => x.id)).toEqual([s.id])
  })
  it('the submitted graph is valid and names no fire: 2 reference latents per still, the card description in the prompt', async () => {
    const w = world(); await mount(w, w.runtime()).render({ count: 2 })
    const g = w.submitted[0].json
    const kinds = Object.values(g).map((n) => (n as unknown as { class_type: string }).class_type)
    expect(kinds.filter((k) => k === 'ReferenceLatent')).toHaveLength(8) // 2 stills x (positive + negative) x 2 images
    expect(kinds.filter((k) => k === 'SaveImage')).toHaveLength(2)
    const text = Object.values(g).filter((n) => (n as unknown as { class_type: string }).class_type === 'CLIPTextEncode').map((n) => String(n.inputs.text)).join(' ')
    expect(text).toContain('dented steel helmet'); expect(text.toLowerCase()).not.toMatch(/fire|flame|burn|grain/)
  })
  it('count 3 = one job, three seeds, three stills', async () => {
    const w = world(); const r = await mount(w, w.runtime()).render({ count: 3, seed: 10 })
    expect(w.jobs.submits).toBe(1)
    expect((r.body.stills as HeroStill[]).map((s) => s.seed)).toEqual([10, 10 + 7919, 10 + 2 * 7919])
    expect(new Set((r.body.stills as HeroStill[]).map((s) => s.id)).size).toBe(3)
  })
  it('refuses a second press while one runs (409 busy), also after a restart; the first still finishes', async () => {
    const w = world(); let open!: () => void
    const held = new Promise<void>((r) => { open = r })
    w.queue.push(heroJob('aaaaaaaa-0000-4000-8000-000000000802', () => held))
    const m = mount(w, w.runtime()); const first = m.render()
    await until(() => w.jobs.submits === 1)
    const second = await m.render()
    expect([second.status, second.body.code]).toEqual([409, 'busy']); expect(second.body.running).toMatchObject({ what: expect.stringContaining('hero') })
    expect((await m.list()).body.running).not.toBeNull()
    expect((await mount(w, w.runtime()).render()).status).toBe(409)
    expect(w.jobs.submits).toBe(1)
    open(); expect((await first).status).toBe(200)
    expect((await m.list()).body.running).toBeNull()
  })
  it('a lost wait is recovered by id: the png lands, the next GET lists the still with the job and cost, nothing is resubmitted', async () => {
    const w = world(); const JOB = 'aaaaaaaa-0000-4000-8000-000000000803'
    w.queue.push(heroJob(JOB, async () => { throw new Error('connection lost') }))
    const m = mount(w, w.runtime()); const r = await m.render()
    expect(r.status).toBeGreaterThanOrEqual(400); expect(r.body.jobId).toBe(JOB)
    expect((await m.list()).body.stills).toEqual([])
    expect((await m.list()).body.unrecovered).toMatchObject([{ jobId: JOB }])
    const { recoverJob } = await import('../../jobs/index.ts')
    const rt = w.runtime({ getJob: async () => heroJob(JOB) })
    await recoverJob(rt, JOB)
    const l = (await mount(w, rt).list()).body
    expect(l.stills).toHaveLength(1); expect(l.stills[0].jobId).toBe(JOB); expect(l.unrecovered).toEqual([])
    expect(w.jobs.submits).toBe(1)
  })
})

describe('approve: one per take', () => {
  const two = async () => {
    const w = world(); const m = mount(w, w.runtime())
    const a = (await m.render({ seed: 1 })).body.still as HeroStill
    w.queue.push(heroJob('aaaaaaaa-0000-4000-8000-000000000804'))
    const b = (await m.render({ seed: 2 })).body.still as HeroStill
    return { w, m, a, b }
  }
  it('approving another un-approves the old one; the disk has exactly one approved json', async () => {
    const { w, m, a, b } = await two()
    expect(a.id).not.toBe(b.id)
    expect((await m.approve(a.id)).body.still).toMatchObject({ id: a.id, approved: true })
    expect((await m.approve(b.id)).body.still).toMatchObject({ id: b.id, approved: true })
    const onDisk = files(w.heroDir).filter((f) => /^hero-.*\.json$/.test(f)).map((f) => json<HeroStill>(path.join(w.heroDir, f)))
    expect(onDisk.filter((s) => s.approved).map((s) => s.id)).toEqual([b.id])
    expect((await m.list()).body.stills.filter((s: HeroStill) => s.approved)).toHaveLength(1)
  })
  it('concurrent approves still leave exactly one', async () => {
    const { w, m, a, b } = await two()
    await Promise.all([m.approve(a.id), m.approve(b.id)])
    const onDisk = files(w.heroDir).filter((f) => /^hero-.*\.json$/.test(f)).map((f) => json<HeroStill>(path.join(w.heroDir, f)))
    expect(onDisk.filter((s) => s.approved)).toHaveLength(1)
  })
  it('a stale still (the take\'s start changed) cannot be approved; unknown and unsafe ids are refused', async () => {
    const { w, m, a } = await two()
    writeFileSync(path.join(w.shot, 'take.json'), JSON.stringify(takeRecord({ startKey: 'c0ffee00' })))
    expect((await m.approve(a.id)).body.code).toBe('stale')
    expect((await m.approve('hero-missing')).status).toBe(404)
    expect((await m.approve('../take')).status).toBe(400)
    expect((await m.approve(a.id, 'take-other')).status).toBe(404)
  })
})

describe('routes', () => {
  it('mounts at ROUTES.hero; GET/POST only; unknown paths 404; foreign POSTs 403; a non-JSON POST 415', async () => {
    const w = world(); const m = mount(w, w.runtime())
    expect(ROUTES.hero).toBe('/__lab/hero'); expect(shotPaths(TAKE).hero).toBe(`lab-assets/shots/${TAKE}/hero`)
    expect((await m.raw('/nope', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404)
    expect((await m.raw('/', { method: 'DELETE' })).status).toBe(405)
    expect((await m.raw('/', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{}' })).status).toBe(403)
    expect((await m.raw('/', { method: 'POST', headers: { 'content-type': 'text/plain', origin: 'http://localhost:5173' }, body: '{}' })).status).toBe(415)
    expect((await m.raw('/')).status).toBe(400)
    expect((await m.raw('/?take=../x')).status).toBe(400)
  })
})
