// M1 + M3 on Render: the opening still drawn against an older Bible is stale (refused before spend, like a keyframe), a take
// locked against an older Bible is a warning only, and a scene prompt naming an unknown @tag gates the default render (an
// override still goes). Real composePrompt; fake Cloud: no network, no credits.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { resetFinishing } from '../finish.ts'
import { mount, TAKE, WORLD, world, type World } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })

const bible = (o: Partial<BibleRecord> = {}): BibleRecord => ({ worldId: WORLD, version: 4, prompt: 'A burnt field at dusk.', master: null,
  candidates: [], lighting: '', materials: '', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', ...o })
function putBible(w: World, b: BibleRecord) {
  const f = path.join(w.pub, ...biblePaths(WORLD).file.split('/'))
  mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(b))
}
function retake(w: World, o: Record<string, unknown>) {
  const f = path.join(w.pub, 'lab-assets', 'shots', TAKE, 'take.json')
  writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), ...o }))
}

describe('Render and the Bible version', () => {
  it('M3: an opening still drawn against Bible v2 while the scene is on v4 is stale: not Ready, and a press is refused free', async () => {
    const w = world({ still: { bibleVersion: 2 } }); putBible(w, bible())
    const m = mount(w, w.runtime())
    const st = (await m.status()).body
    expect(st.missing).toEqual([expect.objectContaining({ code: 'stale_still', message: expect.stringMatching(/scene sheet version 2.*version 4/) })])
    const r = await m.render()
    expect([r.status, w.jobs.submits]).toEqual([409, 0])
    expect(r.body.error).toMatch(/scene sheet version 2/)
  })
  it('m5: a still drawn before the scene had a Bible is stale once the Bible has an approved master; refused free, saying why', async () => {
    const master = { id: 'm1', png: '/lab-assets/locations/m.png', madeBy: 'qwen', seed: 1, depthStrength: 1, jobId: null, credits: 0, createdAt: 't' }
    const before = world(); putBible(before, bible())
    expect((await mount(before, before.runtime()).status()).body.missing).toEqual([]) // no master yet: not stale
    const w = world(); putBible(w, bible({ master }))
    const m = mount(w, w.runtime())
    expect((await m.status()).body.missing).toEqual([expect.objectContaining({ code: 'stale_still', message: expect.stringMatching(/before the scene had its sheet; the sheet now has an approved master \(version 4\)/) })])
    const r = await m.render()
    expect([r.status, w.jobs.submits]).toEqual([409, 0])
    retake(w, { bibleVersion: undefined })
    expect((await m.status()).body.takeBible).toMatch(/locked before the scene had its sheet/)
  })
  it('M3: a take locked against an older Bible is a warning in the status, never a refusal', async () => {
    const w = world({ still: { bibleVersion: 4 } }); putBible(w, bible()); retake(w, { bibleVersion: 3 })
    const st = (await mount(w, w.runtime()).status()).body
    expect(st.missing).toEqual([])
    expect(st.takeBible).toMatch(/locked against scene sheet version 3.*version 4/)
  })
})

describe('Render and an unknown @tag (M1)', () => {
  it('the default prompt would drop the scene: readiness says so, a press without an override is refused free; an override goes', async () => {
    const w = world(); putBible(w, bible({ prompt: 'A burnt field. @rosa walks the fence line while @dragon circles.', elements: [{ tag: 'rosa', kind: 'cast', cardId: 'rosa', refs: [], line: 'a woman' }] }))
    const m = mount(w, w.runtime())
    const st = (await m.status()).body
    expect(st.missing).toEqual([expect.objectContaining({ code: 'unknown_tag', message: expect.stringMatching(/@dragon/) })])
    const r = await m.render()
    expect([r.status, w.jobs.submits]).toEqual([409, 0])
    const ok = await m.render({ prompt: 'A burnt field at dusk, a woman walks the fence line.' })
    expect(ok.status).toBe(200)
    expect(w.jobs.submits).toBe(1)
  })
})
