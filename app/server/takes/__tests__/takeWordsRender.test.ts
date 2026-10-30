// A take's own words on Render (per-shot-prompts): the render reads the TAKE's words, not the scene prompt; a changed take prompt
// asks which way (words_changed: a bare press is refused free), exactly as a drawer (scene prompt) change does for a take
// with no words of its own (wordsOnFrame.test.ts has the choice itself); a scene prompt edit never stales a take that keeps its own words. Fake Cloud: no network, no credits.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import { stillBibleKeys } from '../../../src/shared/stillBible.ts'
import { takeBibleOf } from '../../../src/shared/takeWordsContract.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { resetFinishing } from '../../l2r/finish.ts'
import { mount, STILL, WORLD, world, type World } from '../../l2r/__tests__/rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })

const bible = (prompt: string): BibleRecord => ({ worldId: WORLD, version: 4, prompt, master: null, candidates: [], lighting: '', materials: '', elements: [],
  extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't' })
function putBible(w: World, b: BibleRecord) {
  const f = path.join(w.pub, ...biblePaths(WORLD).file.split('/'))
  mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(b))
}
const edit = (file: string, o: Record<string, unknown>) => writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...o }))
const retake = (w: World, o: Record<string, unknown>) => edit(w.dirs.take, o)
/** the still as drawn against the Bible the take reads now (what the draw records) */
function drawnNow(w: World, b: BibleRecord, take: { prompt?: string }) {
  edit(path.join(w.dirs.hero, `${STILL}.json`), { bibleVersion: b.version, bibleKeys: stillBibleKeys(takeBibleOf(b, take)!) })
}
const sent = (w: World) => JSON.stringify(w.submitted.at(-1)?.json ?? {})

describe("Render reads the take's own words", () => {
  it("sends the take's words, not the scene prompt", async () => {
    const w = world(); const b = bible('A wet street at night.'); putBible(w, b)
    retake(w, { prompt: 'A dry dune at noon.', sceneBase: b.prompt }); drawnNow(w, b, { prompt: 'A dry dune at noon.' })
    const m = mount(w, w.runtime())
    expect((await m.status()).body.missing).toEqual([])
    const r = await m.render()
    expect(r.status).toBe(200)
    expect(sent(w)).toContain('A dry dune at noon.')
    expect(sent(w)).not.toContain('A wet street at night.')
  })

  it('a changed take prompt asks which way (words_changed): a bare press is refused free, the first frame stays valid', async () => {
    const w = world(); const b = bible('A wet street at night.'); putBible(w, b)
    retake(w, { prompt: 'A dry dune at noon.', sceneBase: b.prompt }); drawnNow(w, b, { prompt: 'A dry dune at noon.' })
    retake(w, { prompt: 'A dry dune at dawn.' })
    const m = mount(w, w.runtime())
    expect((await m.status()).body.missing).toEqual([expect.objectContaining({ code: 'words_changed', message: 'The words changed since this first frame was drawn.' })])
    const r = await m.render()
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([409, 'words_changed', 0])
  })

  it('a scene prompt edit never stales a take with its own words; a take without them follows the scene and is staled by it', async () => {
    const w = world(); const b = bible('A wet street at night.'); putBible(w, b)
    retake(w, { prompt: 'A dry dune at noon.', sceneBase: b.prompt }); drawnNow(w, b, { prompt: 'A dry dune at noon.' })
    putBible(w, bible('A wet street at dawn.'))
    expect((await mount(w, w.runtime()).status()).body.missing).toEqual([])
    const old = world(); putBible(old, b); drawnNow(old, b, {}) // a take locked before takes had words
    expect((await mount(old, old.runtime()).status()).body.missing).toEqual([])
    putBible(old, bible('A wet street at dawn.'))
    expect((await mount(old, old.runtime()).status()).body.missing).toEqual([expect.objectContaining({ code: 'words_changed' })])
  })
})
