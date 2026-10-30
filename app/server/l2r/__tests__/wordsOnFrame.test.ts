// Words on frame (owner 10-29): the take's words changed since its first frame was drawn, and nothing else did. Render then asks
// which way instead of refusing outright: a bare press is refused free (words_changed), a press that says wordsOnFrame renders the
// take's words now on the approved frame and records wordsDiffer. Every other stale reason (a set change, the camera, the
// lighting line) still refuses, with or without wordsOnFrame. The hero list keeps the frame valid (wordsChanged, never bibleWhy) so the
// Stage keeps it approved. Fake Cloud: no network, no credits.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import { stillBibleKeys } from '../../../src/shared/stillBible.ts'
import { takeBibleOf } from '../../../src/shared/takeWordsContract.ts'
import { stillHardWhy, wordsOnlyBehind } from '../../../src/shared/wordsOnFrame.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { KitStore } from '../../stage3d/store.ts'
import { resetFinishing } from '../finish.ts'
import { allRenders } from '../store.ts'
import { mount, STILL, WORLD, world, type World } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })

const bible = (o: Partial<BibleRecord> = {}): BibleRecord => ({ worldId: WORLD, version: 4, prompt: 'A wet street at night.', master: null, candidates: [],
  lighting: '', materials: '', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', ...o })
function putBible(w: World, b: BibleRecord) {
  const f = path.join(w.pub, ...biblePaths(WORLD).file.split('/'))
  mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(b))
}
const edit = (file: string, o: Record<string, unknown>) => writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...o }))
const DRAWN = 'A car pulls up to the kerb.'
/** a take whose first frame was drawn from DRAWN, its words now `now` */
function wordsMoved(now: string, b = bible()) {
  const w = world(); putBible(w, b)
  edit(w.dirs.take, { prompt: DRAWN, sceneBase: b.prompt })
  edit(path.join(w.dirs.hero, `${STILL}.json`), { bibleVersion: b.version, bibleKeys: stillBibleKeys(takeBibleOf(b, { prompt: DRAWN })!) })
  edit(w.dirs.take, { prompt: now })
  return w
}
const sent = (w: World) => JSON.stringify(w.submitted.at(-1)?.json ?? {})

describe('the words changed since the first frame', () => {
  it('only the words: the status asks which way, the frame stays the render input, and a bare press is refused free', async () => {
    const w = wordsMoved(`${DRAWN} It stops beside it.`)
    const m = mount(w, w.runtime())
    const st = (await m.status()).body
    expect(st.missing).toEqual([{ code: 'words_changed', message: 'The words changed since this first frame was drawn.', where: expect.stringMatching(/Redraw the first frame.*render the new words on this frame/) }])
    expect(st.still.id).toBe(STILL)
    const r = await m.render()
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([409, 'words_changed', 0])
    expect(w.jobs.ledger()).toBe('')
  })

  it('wordsOnFrame: one paid render of the new words on this frame, recorded as wordsDiffer', async () => {
    const w = wordsMoved(`${DRAWN} It stops beside it.`)
    const r = await mount(w, w.runtime()).render({ wordsOnFrame: true })
    expect(r.status).toBe(200)
    expect(w.jobs.submits).toBe(1)
    expect(sent(w)).toContain('It stops beside it.')
    expect(r.body.render.wordsDiffer).toBe(true)
    expect(r.body.render.stillId).toBe(STILL)
    expect(allRenders(w.pub).find((x) => x.id === r.body.render.id)?.wordsDiffer).toBe(true)
  })

  it('a render whose frame matches its words records no wordsDiffer, and wordsOnFrame there changes nothing', async () => {
    const w = wordsMoved(DRAWN)
    const m = mount(w, w.runtime())
    expect((await m.status()).body.missing).toEqual([])
    const r = await m.render({ wordsOnFrame: true })
    expect(r.status).toBe(200)
    expect(r.body.render.wordsDiffer).toBeUndefined()
  })

  it('the words and the lighting line both changed: stale as before, and wordsOnFrame does not get past it', async () => {
    const w = wordsMoved(`${DRAWN} It stops beside it.`)
    putBible(w, bible({ lighting: 'Noon: a hard white sun' }))
    const m = mount(w, w.runtime())
    expect((await m.status()).body.missing).toEqual([expect.objectContaining({ code: 'stale_still', message: expect.stringMatching(/lighting line/) })])
    const r = await m.render({ wordsOnFrame: true })
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([409, 'stale_still', 0])
  })

  it('another opening (the camera moved) refuses with or without wordsOnFrame', async () => {
    const w = wordsMoved(`${DRAWN} It stops beside it.`)
    edit(path.join(w.dirs.hero, `${STILL}.json`), { startKey: 'older' })
    const r = await mount(w, w.runtime()).render({ wordsOnFrame: true })
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([409, 'stale_still', 0])
  })

  it('a set change refuses with no words option: clay_set_moved, wordsOnFrame or not', async () => {
    const w = world({ clay: { startedAt: '2026-10-22T19:05:00.000Z', finishedAt: '2026-10-22T19:06:00.000Z' } })
    const kits = new KitStore(w.pub)
    const kit = kits.create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]] }, description: 'words on frame test' })
    writeFileSync(w.dirs.take, JSON.stringify({ ...w.take, worldId: `locations/${kit.id}` }))
    kits.changeKit(kit.id, (p) => p.kit.map((it, i) => (i === 0 ? { ...it, at: [it.at[0] + 1, it.at[1]] as [number, number] } : it)), new Date('2026-10-22T19:30:00.000Z'))
    const m = mount(w, w.runtime())
    const st = (await m.status()).body
    expect(st.missing.map((x: { code: string }) => x.code)).toEqual(['clay_set_moved', 'stale_still'])
    const r = await m.render({ wordsOnFrame: true })
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([409, 'clay_set_moved', 0])
  })

  it('a bad wordsOnFrame is a 400, nothing sent', async () => {
    const w = wordsMoved(DRAWN)
    const r = await mount(w, w.runtime()).render({ wordsOnFrame: 'yes' })
    expect([r.status, w.jobs.submits]).toEqual([400, 0])
  })
})

describe('wordsOnlyBehind / stillHardWhy', () => {
  const b = bible()
  const keys = stillBibleKeys(takeBibleOf(b, { prompt: DRAWN })!)
  it('words alone: words-only, no hard reason; nothing changed: neither; an older still with no keys: never words-only', () => {
    const now = takeBibleOf(b, { prompt: 'Other words.' })!
    expect([wordsOnlyBehind({ bibleKeys: keys }, now), stillHardWhy({ bibleKeys: keys }, now)]).toEqual([true, null])
    expect(wordsOnlyBehind({ bibleKeys: keys }, takeBibleOf(b, { prompt: DRAWN })!)).toBe(false)
    expect(wordsOnlyBehind({ bibleVersion: 2 }, now)).toBe(false)
    expect(stillHardWhy({ bibleVersion: 2 }, now)).toMatch(/version 2/)
  })
  it('words plus the lighting line: a hard reason', () => {
    const now = takeBibleOf({ ...b, lighting: 'noon sun' }, { prompt: 'Other words.' })!
    expect(wordsOnlyBehind({ bibleKeys: keys }, now)).toBe(false)
    expect(stillHardWhy({ bibleKeys: keys }, now)).toMatch(/lighting line/)
  })
})
