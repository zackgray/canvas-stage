import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { labMotion } from '../plugin.ts'
import { startFakeBox, type FakeBox } from '../fakeBox.ts'
import { mount, pollJob, postJson, SPEC, tempRoot } from './rig.ts'

const TOKEN = 'test-token'
let root = ''
let box: FakeBox
let app: { base: string; close: () => Promise<void> }

beforeAll(async () => {
  root = tempRoot()
  box = await startFakeBox({ fixturesDir: path.join(root, 'public/mocap/kimodo'), token: TOKEN, tryDelayMs: 10 })
  app = await mount(labMotion({ MOTION_BOX_URL: box.url, MOTION_BOX_TOKEN: TOKEN }), root)
})
afterAll(async () => { await app.close(); await box.close() })

describe('motion health', () => {
  it('off when MOTION_BOX_URL is unset', async () => {
    const off = await mount(labMotion({}), tempRoot())
    expect(await (await fetch(`${off.base}/health`)).json()).toEqual({ state: 'off' })
    await off.close()
  })

  it('ready when the box answers', async () => {
    expect(await (await fetch(`${app.base}/health`)).json()).toEqual({ state: 'ready' })
  })

  it('busy while a job runs', async () => {
    const slowBox = await startFakeBox({ fixturesDir: path.join(root, 'public/mocap/kimodo'), token: TOKEN, n: 8, tryDelayMs: 1000 })
    const slow = await mount(labMotion({ MOTION_BOX_URL: slowBox.url, MOTION_BOX_TOKEN: TOKEN }), tempRoot())
    await postJson(slow.base, '/make', { spec: SPEC })
    expect(await (await fetch(`${slow.base}/health`)).json()).toEqual({ state: 'busy' })
    await slow.close()
    await slowBox.close()
  })

  it('offline when the box cannot be reached', async () => {
    const dead = await mount(labMotion({ MOTION_BOX_URL: 'http://127.0.0.1:9', MOTION_BOX_TOKEN: TOKEN }), tempRoot())
    expect(await (await fetch(`${dead.base}/health`)).json()).toEqual({ state: 'offline' })
    await dead.close()
  })

  it('warming passes through from the box', async () => {
    const warmBox = await startFakeBox({ fixturesDir: path.join(root, 'public/mocap/kimodo'), healthState: 'warming' })
    const warm = await mount(labMotion({ MOTION_BOX_URL: warmBox.url }), tempRoot())
    expect(await (await fetch(`${warm.base}/health`)).json()).toEqual({ state: 'warming' })
    await warm.close()
    await warmBox.close()
  })
})

describe('guards', () => {
  it('foreign pages 403, non-JSON 415, bad JSON 400, bad spec 422, wrong verbs 405, unknown routes 404', async () => {
    expect((await postJson(app.base, '/make', { spec: SPEC }, { origin: 'http://evil.example' })).status).toBe(403)
    expect((await fetch(`${app.base}/make`, { method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } })).status).toBe(415)
    expect((await fetch(`${app.base}/make`, { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } })).status).toBe(400)
    expect((await postJson(app.base, '/make', { spec: { class: 'takeOut' } })).status).toBe(422)
    expect((await fetch(`${app.base}/job`, { method: 'POST' })).status).toBe(405)
    expect((await fetch(`${app.base}/nope`)).status).toBe(404)
    expect((await fetch(`${app.base}/clips`, { headers: { origin: 'http://evil.example' } })).status).toBe(403)
  })
})

describe('make, poll, cancel', () => {
  it('makes a job, writes the on-disk record, queues one more, refuses a third with 409', async () => {
    const slowRootDir = tempRoot()
    const slowBox = await startFakeBox({ fixturesDir: path.join(slowRootDir, 'public/mocap/kimodo'), token: TOKEN, n: 4, tryDelayMs: 1000 })
    const slow = await mount(labMotion({ MOTION_BOX_URL: slowBox.url, MOTION_BOX_TOKEN: TOKEN }), slowRootDir)
    const made = await postJson(slow.base, '/make', { spec: SPEC, n: 4 })
    expect(made.status).toBe(200)
    const { jobId } = await made.json()
    const rec = JSON.parse(readFileSync(path.join(slowRootDir, 'public/lab-assets/motions/.in-flight.json'), 'utf8'))
    expect(rec.jobId).toBe(jobId)
    expect(rec.spec.sentence).toBe(SPEC.sentence)
    expect(rec.lastOk).toBeGreaterThan(0)
    expect((await postJson(slow.base, '/make', { spec: SPEC })).status).toBe(200) // the box's queue of 1 takes it
    const third = await postJson(slow.base, '/make', { spec: SPEC })
    expect(third.status).toBe(409)
    expect((await third.json()).message).toMatch(/making another move/)
    await slow.close()
    await slowBox.close()
  })

  it('polls the job to done: top-3 tries with reasons and the dropped count, and keeps answering after done', async () => {
    await postJson(app.base, '/make', { spec: SPEC, n: 4 })
    const j = await pollJob(app.base, (j) => j.stage === 'done')
    expect(j.of).toBe(4)
    expect(j.tries).toHaveLength(3)
    expect(j.tries[0]).toMatchObject({ rank: 1, reason: 'steadiest hands', seed: 53 })
    expect(j.tries[0].scores.grip_m).toBeCloseTo(0.439, 3)
    expect(j.dropped).toEqual({ count: 1, reason: expect.stringContaining('steadily') })
    const again = await (await fetch(`${app.base}/job`)).json()
    expect(again.stage).toBe('done') // the record survives a finished job so its tries can still be kept
  })

  it('cancels a running job', async () => {
    await postJson(app.base, '/make', { spec: SPEC, n: 8 })
    const cancelled = await postJson(app.base, '/cancel', {})
    expect(cancelled.status).toBe(200)
    expect((await cancelled.json()).stage).toBe('cancelled')
    expect((await (await fetch(`${app.base}/job`)).json()).stage).toBe('cancelled')
  })

  it('re-attaches to the box job after a dev-server restart, from the on-disk record', async () => {
    const { jobId } = await (await postJson(app.base, '/make', { spec: SPEC, n: 3 })).json()
    await app.close() // restart: the plugin instance and its memory are gone
    app = await mount(labMotion({ MOTION_BOX_URL: box.url, MOTION_BOX_TOKEN: TOKEN }), root)
    const j = await pollJob(app.base, (j) => j.stage === 'done')
    expect(j.id).toBe(jobId) // no new make: the restarted plugin picked the job up from the record on disk
    expect(j.tries).toHaveLength(3)
  })
})

describe('the job view', () => {
  it('reads the motion box\'s stage by its first word ("generating 3/4" is generating)', async () => {
    const { stageOf } = await import('../jobView.ts')
    expect(stageOf('generating 3/4')).toBe('generating')
    expect(stageOf('done')).toBe('done')
    expect(stageOf('retargeting')).toBe('retargeting')
  })
})
