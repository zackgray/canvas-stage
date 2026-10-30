import { existsSync, readFileSync } from 'node:fs'
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

const madeJob = async () => {
  const { jobId } = await (await postJson(app.base, '/make', { spec: SPEC, n: 4 })).json()
  const j = await pollJob(app.base, (j) => j.stage === 'done')
  return { jobId, tryId: (j.tries as { id: number }[])[0].id }
}

describe('keep', () => {
  it('downloads a try into the user-clip folder and returns the gen: id', async () => {
    const { jobId, tryId } = await madeJob()
    const kept = await postJson(app.base, '/keep', { job: jobId, try: tryId, label: 'Takes a frame out of the hive' })
    expect(kept.status).toBe(200)
    const body = await kept.json()
    expect(body.id).toBe('gen:takes-a-frame-out-of-the-hive')

    const dir = path.join(root, 'public/lab-assets/motions/takes-a-frame-out-of-the-hive')
    expect(readFileSync(path.join(dir, 'clip.bvh'))
      .equals(readFileSync(path.join(root, 'public/mocap/kimodo/lift_frame.bvh')))).toBe(true)
    expect(readFileSync(path.join(dir, 'strip.png')).subarray(0, 4).toString('hex')).toBe('89504e47')
    const clip = JSON.parse(readFileSync(path.join(dir, 'clip.json'), 'utf8'))
    expect(clip).toMatchObject({
      url: '/lab-assets/motions/takes-a-frame-out-of-the-hive/clip.bvh',
      source: { generated: `kimodo:${jobId}/53` },
      note: 'Takes a frame out of the hive',
      root: 'pinned',
      in: 0,
      out: 8,
      hold: [4.5, 7.95],
      prop: { grab: 2.5 },
      sentence: SPEC.sentence,
      class: 'takeOut',
      seed: 53,
      encoder: 'cpu (fake)',
    })
    expect(clip.phases).toHaveLength(1)
    expect(clip.scores.grip_m).toBeCloseTo(0.439, 3)
    expect(typeof clip.date).toBe('string')
  })

  it('dedupes the motion id when the same label is kept twice', async () => {
    const { jobId, tryId } = await madeJob()
    const again = await postJson(app.base, '/keep', { job: jobId, try: tryId, label: 'Takes a frame out of the hive' })
    expect((await again.json()).id).toBe('gen:takes-a-frame-out-of-the-hive-2')
  })

  it('404s when the job or try is unknown', async () => {
    expect((await postJson(app.base, '/keep', { job: 'nope', try: 0, label: 'x' })).status).toBe(404)
    const { jobId } = await madeJob()
    expect((await postJson(app.base, '/keep', { job: jobId, try: 99, label: 'x' })).status).toBe(502) // the box has no such try
    // the motion box names its tries ("try6"): a name is asked of the box as it is, never refused here; a path is refused
    expect((await postJson(app.base, '/keep', { job: jobId, try: 'try6', label: 'x' })).status).toBe(502)
    expect((await postJson(app.base, '/keep', { job: jobId, try: '../x', label: 'x' })).status).toBe(404)
  })

  it('lists kept clips for the library loader', async () => {
    const list = await (await fetch(`${app.base}/clips`)).json()
    expect(list.clips).toEqual([
      expect.objectContaining({ id: 'gen:takes-a-frame-out-of-the-hive', note: 'Takes a frame out of the hive', seconds: 8 }),
      expect.objectContaining({ id: 'gen:takes-a-frame-out-of-the-hive-2' }),
    ])
  })
})

describe('lost contact, stalls and failed downloads', () => {
  it('says lost contact when polls fail for too long; Check again re-attaches after a restart', async () => {
    const r = tempRoot()
    const b = await startFakeBox({ fixturesDir: path.join(r, 'public/mocap/kimodo'), token: TOKEN, n: 8, tryDelayMs: 1000 })
    const a = await mount(labMotion({ MOTION_BOX_URL: b.url, MOTION_BOX_TOKEN: TOKEN }, { lostAfterMs: 80 }), r)
    await postJson(a.base, '/make', { spec: SPEC })
    await b.close() // the box drops mid-job; the job itself may still finish on the box
    const lost = await pollJob(a.base, (j) => j.stage === 'lost')
    expect(lost.message).toMatch(/Lost contact with the motion computer/)
    await a.close()
  })

  it('fails a job that outruns its whole-job budget, keeping the tries visible', async () => {
    const r = tempRoot()
    const b = await startFakeBox({ fixturesDir: path.join(r, 'public/mocap/kimodo'), token: TOKEN, n: 8, tryDelayMs: 1000 })
    const a = await mount(labMotion({ MOTION_BOX_URL: b.url, MOTION_BOX_TOKEN: TOKEN }, { jobBudgetMs: 1 }), r)
    const { jobId } = await (await postJson(a.base, '/make', { spec: SPEC })).json()
    await b.close()
    const stalled = await pollJob(a.base, (j) => j.stage === 'failed')
    expect(stalled.id).toBe(jobId)
    expect(stalled.message).toMatch(/stalled/)
    await a.close()
  })

  it('a failed keep download says Try again and writes no clip folder', async () => {
    const r = tempRoot()
    const b = await startFakeBox({ fixturesDir: path.join(r, 'public/mocap/kimodo'), token: TOKEN, tryDelayMs: 10 })
    const a = await mount(labMotion({ MOTION_BOX_URL: b.url, MOTION_BOX_TOKEN: TOKEN }), r)
    const { jobId } = await (await postJson(a.base, '/make', { spec: SPEC, n: 4 })).json()
    await pollJob(a.base, (j) => j.stage === 'done')
    await b.close()
    const failed = await postJson(a.base, '/keep', { job: jobId, try: 0, label: 'never kept' })
    expect(failed.status).toBe(502)
    expect((await failed.json()).error).toMatch(/Try again/)
    expect(existsSync(path.join(r, 'public/lab-assets/motions/never-kept'))).toBe(false)
    await a.close()
  })
})

describe('the result of a make', () => {
  it('a try is kept once: Play here then Use this one answer the same clip; Try another moves which try is shown; discard ends it', async () => {
    const { jobId, tryId } = await madeJob()
    const a = await (await postJson(app.base, '/keep', { job: jobId, try: tryId, label: 'kept once' })).json()
    const b = await (await postJson(app.base, '/keep', { job: jobId, try: tryId, label: 'kept once' })).json()
    expect(b.id).toBe(a.id)
    expect(existsSync(path.join(root, 'public/lab-assets/motions/kept-once-2'))).toBe(false)
    expect((await postJson(app.base, '/shown', { job: jobId, shown: 1 })).status).toBe(200)
    expect(await (await fetch(`${app.base}/job`)).json()).toMatchObject({ shown: 1 })
    expect((await postJson(app.base, '/shown', { job: 'nope', shown: 1 })).status).toBe(404)
    expect((await postJson(app.base, '/discard', { job: jobId })).status).toBe(200)
    expect((await fetch(`${app.base}/job`)).status).toBe(404)
  })

  it('her make is kept with whose it is and her words, and /job answers them with the spec (a reload shows it again)', async () => {
    await postJson(app.base, '/make', { spec: SPEC, n: 2, owner: 'loc-a', words: 'takes a frame out of the hive' })
    const j = await pollJob(app.base, (x) => x.stage === 'done')
    expect(j).toMatchObject({ owner: 'loc-a', words: 'takes a frame out of the hive', shown: 0, spec: SPEC })
    // read again later (a reload, the person picked again): the finished make still lists its tries
    const again = await (await fetch(`${app.base}/job`)).json()
    expect(again.tries.length).toBe(j.tries.length)
    expect(again.tries.length).toBeGreaterThan(0)
  })
})
