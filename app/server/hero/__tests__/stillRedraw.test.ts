// The paid redraws on a still (face from its card, piece from its board tile) as pass candidates: the job id on the candidate before
// the wait, the paste inside the mask only, free refusals that leave nothing behind, Recover by id that never resubmits, and Keep
// making a NEW approved still that Render's readiness sees. Fake Cloud only.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PassCandidate } from '../../../src/shared/passContract.ts'
import { call, JSON_LOCAL, post } from '../../project/__tests__/rig.ts'
import { approvedStill } from '../../l2r/inputs.ts'
import { labPasses } from '../../passes/plugin.ts'
import { resetRegistry } from '../../passes/registry.ts'
import { listCandidates, passesDirOf } from '../../passes/store.ts'
import { readMaskPng } from '../idMask.ts'
import { mount } from './rig.ts'
import { redrawJob, redrawTake, STILL_ID, type RedrawTake } from './redrawRig.ts'

type H = Parameters<typeof call>[0]
const JOB = (n: number) => `bbbbbbbb-0000-4000-8000-00000000000${n}`

function setup(t: RedrawTake, over: Parameters<RedrawTake['runtime']>[0] = {}) {
  const rt = t.runtime({ fetchInfo: async () => t.info, ...over })
  const hero = mount(t, rt)
  const routes: Record<string, H> = {}
  ;(labPasses().configureServer as (s: unknown) => void)({ config: { root: t.root, publicDir: t.pub }, middlewares: { use: (p: string, h: H) => { routes[p] = h } } })
  const passes = routes['/__lab/passes']
  const body = (b: unknown) => ({ method: 'POST', headers: JSON_LOCAL, body: JSON.stringify(b) })
  return {
    rt, redraw: (pass: 'face' | 'prop', subject: string) => hero.raw('/redraw', body({ takeId: t.take.id, stillId: STILL_ID, pass, subject })),
    act: (verb: string, id: string) => post(passes, `/${verb}`, { id }),
  }
}
const img = (file: string) => PNG.sync.read(readFileSync(file))
const fileOf = (t: RedrawTake, url: string) => path.join(t.pub, ...url.slice(1).split('/'))

/** every pixel the mask does not cover is the still's, exactly; some inside it changed */
function onlyInside(t: RedrawTake, c: PassCandidate) {
  const before = img(path.join(t.heroDir, `${STILL_ID}.png`)), after = img(fileOf(t, c.afterUrl!)), mask = readMaskPng(path.join(t.heroDir, 'redraw', `${c.id}-mask.png`))
  let outside = 0, inside = 0
  for (let i = 0; i < mask.data.length; i++) {
    const same = before.data[i * 4] === after.data[i * 4] && before.data[i * 4 + 1] === after.data[i * 4 + 1] && before.data[i * 4 + 2] === after.data[i * 4 + 2]
    if (!mask.data[i] && !same) outside++
    if (mask.data[i] && !same) inside++
  }
  return { outside, inside, masked: mask.data.reduce((a, b) => a + b, 0) }
}

beforeEach(() => resetRegistry())

describe('face redraw from the card', () => {
  it('one priced job; the candidate holds the job id BEFORE the wait; the paste stays inside the face oval', async () => {
    const t = redrawTake()
    let seenJob: string | null | undefined
    t.queue.push(redrawJob(JOB(1), { wait: async () => { seenJob = (await listCandidates(t.pub, t.take.id))[0]?.jobId } }))
    const s = setup(t)
    const r = await s.redraw('face', 'hero')
    expect(r.status).toBe(200)
    const c = (r.body as { candidate: PassCandidate }).candidate
    expect(seenJob).toBe(JOB(1))
    expect(t.jobs.submits).toBe(1)
    expect(c).toMatchObject({ state: 'candidate', pass: 'face', subject: 'ana', target: { kind: 'still', stillId: STILL_ID }, jobId: JOB(1), beforeUrl: `/lab-assets/shots/${t.take.id}/hero/${STILL_ID}.png` })
    const sent = t.submitted[0].json
    expect(String(sent.p.inputs.text)).toMatch(/redraw only the face .* as the face of the person in image 2: A lean|battle-worn woman/)
    const d = onlyInside(t, c)
    expect(d.outside).toBe(0)
    expect(d.inside).toBeGreaterThan(0)
    expect(d.masked).toBeLessThan(400) // the face oval, not the figure or its box
    for (const u of [c.beforeCropUrl!, c.afterCropUrl!]) expect(img(fileOf(t, u)).width).toBe(c.box.w) // 100 %: the crop is the box's own pixels
  })

  it('free refusals: no card, no face here, a stale still, a bad subject — nothing submitted, no candidate left', async () => {
    const t = redrawTake({ idPass: false })
    const s = setup(t)
    expect((await s.redraw('face', 'hero')).body).toMatchObject({ code: 'no_face' })
    expect((await s.redraw('face', 'extra:1:2')).status).toBe(400) // the untagged crowd extra is not a staged person
    expect((await s.redraw('face', '../x')).status).toBe(400)
    expect(t.jobs.submits).toBe(0)
    expect(await listCandidates(t.pub, t.take.id)).toEqual([])
  })

  it('a budget refusal removes the candidate (nothing billed); a lost wait keeps it with its job id and Recover finishes it by id', async () => {
    const poor = redrawTake({ cap: 2 }) // the day budget has 2 cr left; a redraw is priced 3
    const refused = await setup(poor).redraw('face', 'hero')
    expect(refused.status).toBe(429)
    expect(poor.jobs.submits).toBe(0)
    expect(await listCandidates(poor.pub, poor.take.id)).toEqual([])
    const t = redrawTake()
    t.queue.push(redrawJob(JOB(2), { wait: async () => { throw new Error('socket hang up') } }))
    const s = setup(t)
    const r = await s.redraw('face', 'hero')
    expect(r.status).toBeGreaterThanOrEqual(500)
    const [failed] = await listCandidates(t.pub, t.take.id)
    expect(failed).toMatchObject({ state: 'failed', jobId: JOB(2) })
    const submits = t.jobs.submits
    // Recover: the job is fetched by id (getJob), never submitted again
    const s2 = setup(t, { getJob: async () => redrawJob(JOB(2)) })
    const rec = await s2.act('recover', failed.id)
    expect(rec.status).toBe(200)
    expect((rec.body as { candidate: PassCandidate }).candidate).toMatchObject({ state: 'candidate', jobId: JOB(2) })
    expect(t.jobs.submits).toBe(submits)
    expect(onlyInside(t, (rec.body as { candidate: PassCandidate }).candidate).outside).toBe(0)
  })
})

describe('prop redraw from its board tile', () => {
  it('pastes inside the piece\'s own ID mask only (never the crop); a piece sharing its colour is refused free', async () => {
    const t = redrawTake()
    t.queue.push(redrawJob(JOB(3)))
    const s = setup(t)
    const c = ((await s.redraw('prop', 'trunk')).body as { candidate: PassCandidate }).candidate
    expect(c).toMatchObject({ state: 'candidate', pass: 'prop', subject: 'trunk' })
    const d = onlyInside(t, c)
    expect(d.outside).toBe(0)
    expect(d.masked).toBe(30 * 2 * 25 * 2) // exactly the trunk's ID pixels on the 2x still
    expect(String(t.submitted[0].json.p.inputs.text)).toMatch(/redraw the trunk as the trunk in image 2: a heavy worn leather trunk with brass fittings\. Keep the trunk's exact size/)
    expect((await s.redraw('prop', 'lamp')).body).toMatchObject({ code: 'shared_mask' })
    expect(t.jobs.submits).toBe(1)
  })
})

describe('Keep on a still redraw', () => {
  it('makes a NEW approved still (the old one and its picture untouched), so Render sees a different approved still; a second candidate from the old still is refused', async () => {
    const t = redrawTake()
    t.queue.push(redrawJob(JOB(4)), redrawJob(JOB(5)))
    const s = setup(t)
    const a = ((await s.redraw('face', 'hero')).body as { candidate: PassCandidate }).candidate
    const b = ((await s.redraw('prop', 'trunk')).body as { candidate: PassCandidate }).candidate
    const oldPng = readFileSync(path.join(t.heroDir, `${STILL_ID}.png`))
    const kept = await s.act('keep', a.id)
    expect(kept.status).toBe(200)
    expect((kept.body as { candidate: PassCandidate }).candidate).toMatchObject({ state: 'kept', replacedUrl: `/lab-assets/shots/${t.take.id}/hero/${STILL_ID}.png` })
    const made = JSON.parse(readFileSync(path.join(t.heroDir, `${STILL_ID}-r1.json`), 'utf8'))
    expect(made).toMatchObject({ id: `${STILL_ID}-r1`, approved: true, role: 'opening', frame: 0, startKey: t.take.startKey, redrawOf: STILL_ID, passId: a.id, jobId: JOB(4) })
    expect(readFileSync(path.join(t.heroDir, `${STILL_ID}-r1.png`))).toEqual(readFileSync(fileOf(t, a.afterUrl!)))
    expect(JSON.parse(readFileSync(path.join(t.heroDir, `${STILL_ID}.json`), 'utf8')).approved).toBe(false)
    expect(readFileSync(path.join(t.heroDir, `${STILL_ID}.png`))).toEqual(oldPng)
    expect(approvedStill(t.heroDir, t.take.id)?.id).toBe(`${STILL_ID}-r1`) // Render's readiness: the approved still changed id
    const second = await s.act('keep', b.id)
    expect(second.body).toMatchObject({ code: 'target_changed' })
    // and a new redraw on the replaced still is refused before any spend
    expect((await s.redraw('prop', 'trunk')).body).toMatchObject({ code: 'redrawn' })
    expect(t.jobs.submits).toBe(2)
    expect(existsSync(path.join(passesDirOf(t.pub, t.take.id), `${b.id}.json`))).toBe(true)
  })
})
