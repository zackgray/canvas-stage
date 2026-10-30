// The face pass's money path with fakes: refusals before any spend, the candidate before the submit with its job id as soon as
// known, one submit, the paste + finish + crops, Keep making it the render's finished cut (the earlier cut kept), Finish again
// starting from the face-passed picture, and recovery by id after a reload (never a resubmit).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PassCandidate } from '../../../src/shared/passContract.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { recovererOf, resetRegistry } from '../../passes/registry.ts'
import { createCandidate, keepCandidate, listCandidates, readCandidate } from '../../passes/store.ts'
import { resetFinishing } from '../finish.ts'
import { FACE_INTERRUPTED } from '../faceRoutes.ts'
import { faceLabel } from '../faceSpec.ts'
import { faceCue, facePrompt, windowPrompt } from '../facePrompts.ts'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import { bothInfo, faceJob, faceWorld, finishedRender, HERO, mountFace } from './faceRig.ts'
import { TAKE, until } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing(); resetRegistry() })

async function setup() {
  const w = faceWorld()
  const rt = w.runtime({ fetchInfo: async () => bothInfo() })
  const m = mountFace(w, rt)
  const id = await finishedRender(w, m)
  const submitsBefore = w.jobs.submits
  const cands = async () => listCandidates(w.pub, TAKE)
  return { w, rt, m, id, submitsBefore, cands }
}
const settled = async (pub: string, c: PassCandidate) => { let x = c; await until(() => { x = JSON.parse(readFileSync(path.join(pub, 'lab-assets', 'shots', TAKE, 'passes', `${c.id}.json`), 'utf8')); return x.state !== 'running' }); return x }

describe('face pass: before any spend', () => {
  it('the strip is free and is the track of the render on show', async () => {
    const { w, m, id, submitsBefore } = await setup()
    const t = await m.track(id)
    expect(t.status).toBe(200)
    expect(t.body.person.track).toMatchObject({ ok: true, frames: [0, 24, 40, 48], strip: expect.stringContaining(`/l2r/face/${id}/hero/strip.png`) })
    const plan = JSON.parse(readFileSync(w.face.calls[0][2], 'utf8'))
    expect(path.basename(plan.raw)).toBe(`${id}-raw.mp4`) // the render's raw: nothing kept yet
    expect(plan).toMatchObject({ idFrames: [0, 24, 48], color: [255, 0, 0], unitM: 0.01, stripFrames: [0, 24, 40, 48] })
    expect((await m.status(id)).body.people[0]).toMatchObject({ subject: 'hero', name: 'Mara', small: true, why: null, track: { ok: true } })
    await m.track(id)
    expect(w.face.calls.filter((c) => c[1] === 'track')).toHaveLength(1) // fresh: not run again
    expect(w.jobs.submits).toBe(submitsBefore)
  })
  it('refuses, free: an unfinished render, a person not staged, a face that cannot be followed', async () => {
    const { w, m, id, submitsBefore, cands } = await setup()
    const rec = path.join(w.dirs.l2r, `${id}.json`)
    const r = JSON.parse(readFileSync(rec, 'utf8'))
    writeFileSync(rec, JSON.stringify({ ...r, finished: null }))
    expect((await m.fix(id)).body.code).toBe('not_finished')
    writeFileSync(rec, JSON.stringify(r))
    expect((await m.fix(id, 'extra:3:1')).status).toBe(404)
    w.face.track = { ok: false, why: 'the face was found on only 10 of 49 frames' }
    const nt = await m.fix(id)
    expect([nt.status, nt.body.code]).toEqual([409, 'no_track'])
    expect(nt.body.error).toMatch(/only 10 of 49/)
    expect(await cands()).toHaveLength(0) // no candidate for a refusal before the spend
    expect(w.jobs.submits).toBe(submitsBefore)
  })
  it('a free refusal at the runner (day budget) answers as itself; the candidate says nothing was spent', async () => {
    const w = faceWorld(18) // the 18 cr render fills the day: the 12 cr face pass is refused
    const m = mountFace(w, w.runtime({ fetchInfo: async () => bothInfo() }))
    const id = await finishedRender(w, m)
    const n = w.jobs.submits
    const res = await m.fix(id)
    expect([res.status, res.body.code]).toEqual([429, 'budget'])
    const [c] = await listCandidates(w.pub, TAKE)
    expect(c).toMatchObject({ state: 'failed', jobId: null, error: expect.stringMatching(/Nothing was spent/) })
    expect(w.jobs.submits).toBe(n)
  })
  it('one face pass at a time (409 busy)', async () => {
    const { w, m, id } = await setup()
    let open!: () => void
    w.queue.push(faceJob('cccccccc-0000-4000-8000-000000000001', () => new Promise<void>((r) => { open = r })))
    const first = await m.fix(id)
    expect(first.status).toBe(200)
    expect((await m.fix(id)).status).toBe(409)
    open()
    await settled(w.pub, first.body.candidate)
  })
})

describe('face pass: the paid job and the candidate', () => {
  it('writes the candidate before the submit, puts the job id on it, then pastes, finishes and crops', async () => {
    const { w, m, id, submitsBefore } = await setup()
    let open!: () => void
    w.queue.push(faceJob('cccccccc-0000-4000-8000-000000000002', () => new Promise<void>((r) => { open = r })))
    const res = await m.fix(id)
    expect(res.body.error).toBeUndefined()
    expect(res.status).toBe(200)
    const running = res.body.candidate as PassCandidate
    // answered once the runner had the job: the candidate on disk carries the id while the job still runs
    expect(running).toMatchObject({ pass: 'facePass', state: 'running', subject: 'hero', target: { kind: 'render', renderId: id }, jobId: 'cccccccc-0000-4000-8000-000000000002',
      beforeUrl: `/lab-assets/shots/${TAKE}/l2r/${id}-finished.mp4`, costCredits: 12, box: { x: 860, y: 301, w: 200, h: 200 } })
    expect(w.order.filter((o) => o.startsWith('ledger-before-submit')).at(-1)).toBe('ledger-before-submit:true')
    open()
    const done = await settled(w.pub, running)
    expect(done).toMatchObject({ state: 'candidate', afterUrl: `/lab-assets/shots/${TAKE}/l2r/face/${id}/${running.id}/after.mp4`,
      beforeCropUrl: expect.stringMatching(/before-crop\.png$/), afterCropUrl: expect.stringMatching(/after-crop\.png$/), jobId: running.jobId })
    expect(w.jobs.submits).toBe(submitsBefore + 1)
    // the graph sent: the Klein face window and the window L2R, the four binds
    const g = w.submitted.at(-1)!.json
    expect(g.fout.class_type).toBe('SaveImage'); expect(g.gd2_t.inputs.model).toEqual(['unet', 0]); expect(g.h2_t.inputs.image).toEqual(['fst', 0])
    expect(String(g.p0.inputs.text)).toMatch(/^A close-up of the face of A woman of thirty in a denim jacket, as they move through the shot\./)
    expect(JSON.stringify(g)).not.toMatch(/calm|rim light/) // no stock expression, no recipe light
    // the paste works on the pass's own copy of the picture it was cut from; the after is finished as the render is (sharpen -> grain)
    const paste = w.face.calls.find((c) => c[1] === 'paste')!
    expect(path.basename(JSON.parse(readFileSync(paste[2], 'utf8')).raw)).toBe('source.mp4')
    const names = w.py.calls.map((c) => path.basename(c[1]))
    expect(names).toEqual(['sharpen.py', 'grain.py'])
    expect(path.basename(w.py.calls[0][2])).toBe('after-raw.mp4')
  })
})

describe('face pass: Keep, Finish again, recovery', () => {
  async function kept() {
    const s = await setup()
    s.w.queue.push(faceJob('cccccccc-0000-4000-8000-000000000003'))
    const c = await settled(s.w.pub, (await s.m.fix(s.id)).body.candidate)
    return { ...s, c }
  }
  it('Keep makes the passed MP4 the finished cut and keeps the earlier one on disk', async () => {
    const { w, id, c } = await kept()
    const k = await keepCandidate(w.pub, c.id)
    expect(k.state).toBe('kept')
    expect(k.replacedUrl).toBe(`/lab-assets/shots/${TAKE}/l2r/${id}-finished-before-${c.id}.mp4`)
    expect(existsSync(path.join(w.dirs.l2r, `${id}-finished-before-${c.id}.mp4`))).toBe(true)
    expect(JSON.parse(readFileSync(path.join(w.dirs.l2r, `${id}.json`), 'utf8')).finished).toBe(c.afterUrl)
  })
  it('Finish again after a Keep re-finishes the face-passed picture, never the raw underneath', async () => {
    const { w, m, id, c } = await kept()
    await keepCandidate(w.pub, c.id)
    w.py.calls.length = 0
    const f = await m.finish(id, { grade: false })
    expect(f.status).toBe(200)
    expect(w.py.calls[0].slice(1).map((a) => path.basename(a)).slice(0, 2)).toEqual(['sharpen.py', 'after-raw.mp4'])
    expect(f.body.render.finished).toBe(`/lab-assets/shots/${TAKE}/l2r/${id}-finished.mp4`)
    // the face-passed cut that was replaced by this finish was never the canonical file, so nothing was lost
    expect(existsSync(path.join(w.dirs.l2r, `${id}-finished-before-${c.id}.mp4`))).toBe(true)
  })
  it('a pass started before another Keep is still kept, pasted again onto the kept face (paid work is never a dead end: faceKeepJoin.test.ts)', async () => {
    const { w, m, id, c } = await kept()
    w.queue.push(faceJob('cccccccc-0000-4000-8000-000000000004'))
    const second = await settled(w.pub, (await m.fix(id)).body.candidate)
    await keepCandidate(w.pub, c.id)
    expect((await keepCandidate(w.pub, second.id)).state).toBe('kept')
  })
  it('a pass whose paste failed is recovered by id: the job fetched, never resubmitted', async () => {
    const s = await setup()
    s.w.face.fail.paste = 'boom'
    s.w.queue.push(faceJob('cccccccc-0000-4000-8000-000000000005'))
    const failed = await settled(s.w.pub, (await s.m.fix(s.id)).body.candidate)
    expect(failed).toMatchObject({ state: 'failed', jobId: 'cccccccc-0000-4000-8000-000000000005', error: expect.stringMatching(/Recover re-fetches it by id/) })
    delete s.w.face.fail.paste
    const n = s.w.jobs.submits
    const rt = s.w.runtime({ fetchInfo: async () => bothInfo(), getJob: async (jid: string) => faceJob(jid) })
    const m2 = mountFace(s.w, rt) // a reload: a new runtime, the recoverer registered again
    void m2
    const got = await recovererOf('facePass')!(failed, { publicDir: s.w.pub })
    expect(got.afterUrl).toMatch(/after\.mp4$/)
    expect(s.w.jobs.submits).toBe(n)
  })
  it('after a reload: a running candidate gets its job id from the runner; one that never reached Cloud is failed as free', async () => {
    const s = await setup()
    const rt = s.w.runtime({ fetchInfo: async () => bothInfo() })
    const m2 = mountFace(s.w, rt)
    const base = { takeId: TAKE, pass: 'facePass' as const, target: { kind: 'render' as const, renderId: s.id }, subject: 'hero', box: { x: 0, y: 0, w: 1, h: 1 }, beforeUrl: 'x', costCredits: 12 }
    const lost = await createCandidate(s.w.pub, base)
    const sent = await createCandidate(s.w.pub, base)
    const now = new Date().toISOString()
    rt.store.save({ id: 'job-rec-1', label: faceLabel(TAKE, s.id, sent.id), status: 'waiting', jobId: 'dddddddd-0000-4000-8000-000000000001', attempts: [], estimateCredits: 12, costCents: null, costCredits: null,
      execSeconds: null, outputs: {}, saved: [], createdAt: now, updatedAt: now, pid: process.pid })
    await m2.status(s.id)
    expect(await readCandidate(s.w.pub, TAKE, lost.id)).toMatchObject({ state: 'failed', jobId: null, error: FACE_INTERRUPTED })
    expect(await readCandidate(s.w.pub, TAKE, sent.id)).toMatchObject({ state: 'running', jobId: 'dddddddd-0000-4000-8000-000000000001' })
  })
  it('the people come from the stub, each with the price on the button', async () => {
    const { m, id } = await setup()
    const st = (await m.status(id)).body
    expect(st).toMatchObject({ renderId: id, price: 12, people: [{ subject: HERO.subject }] })
  })
})

describe('face pass prompts (prompt wave): the beat at face scale, the light exactly as image 1, no stock expression', () => {
  const brief = { logline: '', place: { setting: '', period: '', season: '', time: '', weather: '' }, atmosphere: [], camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '', background: '',
    exclude: [], warnings: [], developed: [], light: { key: '', direction: '', height: '', quality: '', colour: '', others: '', effect: '' },
    elements: [{ name: 'Lamp', tag: 'lamp', type: 'prop', look: '', supported: true, materials: '', condition: '', face: '' }],
    beats: [{ who: '@ana', does: 'reaches for @lamp', seconds: 2, visible: 'frowning at the dark' }, { who: '@ana', does: 'sits', seconds: 2, visible: '' }] }
  const bible = { elements: [{ tag: 'ana', kind: 'cast', cardId: 'c-ana', refs: [], line: '' }], brief } as unknown as BibleRecord
  it('the cue is the first beat of the person whose card it is; none without a v2 brief or a beat', () => {
    expect(faceCue(bible, 'c-ana')).toEqual({ does: 'reaches for the lamp', visible: 'frowning at the dark' })
    expect(faceCue(bible, 'c-other')).toBeNull()
    expect(faceCue({ ...bible, brief: undefined } as unknown as BibleRecord, 'c-ana')).toBeNull()
  })
  it('the window sentence carries the beat; the Klein face keeps the light of image 1 and never says calm or rim', () => {
    const cue = faceCue(bible, 'c-ana')
    expect(windowPrompt('A tall woman in a red coat. She is tired.', cue)).toBe('A close-up of the face of A tall woman in a red coat, who reaches for the lamp, frowning at the dark. ' +
      'Match the first frame: the same face, hair and clothes, the same light. Photoreal, natural skin, real eyes.')
    const k = facePrompt('A tall woman in a red coat', cue)
    expect(k).toContain('Keep the light on the face exactly as in image 1, and its colours.')
    expect(k).toMatch(/Natural skin with real texture, frowning at the dark\.$/)
    for (const p of [k, facePrompt('a man', null), windowPrompt('a man', null)]) expect(p).not.toMatch(/calm|rim light|shade and rim/)
    expect(facePrompt('a man', null)).toMatch(/clear eyes\.$/)
  })
})
