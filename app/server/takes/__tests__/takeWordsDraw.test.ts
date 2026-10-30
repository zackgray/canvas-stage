// A take's own words on the real draw path (fake Cloud, nothing paid): the kit press draws from the TAKE's words, not the scene
// prompt; the still records them, so changing the take's words is said on the Stage's list (wordsChanged, the frame still valid)
// and asked on Render (words_changed: redraw, or the new words on this frame), while a scene prompt edit leaves a take with its own words alone and only raises "scene prompt changed".
import { describe, expect, it } from 'vitest'
import { handleBible } from '../../bible/routes.ts'
import { BibleStore } from '../../bible/store.ts'
import { kitInfo, kitTake, pngJob, stillPng } from '../../hero/__tests__/kitRig.ts'
import { mount } from '../../hero/__tests__/rig.ts'
import type { KitStill } from '../../hero/kitSpec.ts'
import { defaultPrompt } from '../../l2r/compose.ts'
import { readiness } from '../../l2r/inputs.ts'
import type { HeroListResponse } from '../../../src/shared/shotContract.ts'
import { boardRow, setTakeWords } from '../words.ts'
import { readTake } from '../store.ts'
import { readBibleFile } from '../../bible/read.ts'

const SCENE = 'A quiet harbour at dawn.'
const OWN = 'A crowded market at noon.'

async function drawn() {
  const t = kitTake({ bible: { prompt: SCENE }, take: { prompt: OWN, sceneBase: SCENE } })
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000a01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-000000000a02', stillPng()))
  const hero = mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
  const r = await hero.render()
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  const still = (r.body as { still: KitStill }).still
  expect((await hero.approve(still.id)).status).toBe(200)
  const row = async () => ((await hero.list()).body as unknown as HeroListResponse).stills.find((s) => s.id === still.id)!
  const listed = async () => (await row()).bibleWhy ?? null
  const render = () => readiness(t.pub, t.take.id).missing.find((m) => m.code === 'stale_still')?.message ?? null
  return { t, still, row, listed, render }
}

describe("the draw reads the take's own words", () => {
  it("sends the take's words, never the scene prompt, and the still records them", async () => {
    const { t, still } = await drawn()
    const draws = JSON.stringify(t.submitted[0].json)
    expect(draws).toContain(OWN)
    expect(draws).not.toContain(SCENE)
    expect(still.prompt).toContain(OWN)
    // and the render of this 3D-set take is written from them too
    const render = await defaultPrompt(t.pub, readTake(t.pub, t.take.id)!)
    expect(render).toContain('crowded market at noon')
    expect(render).not.toContain('harbour')
  })

  it("a changed take prompt keeps the approved still valid on the Stage's list and asks which way on Render (wordsOnFrame.ts)", async () => {
    const { t, row, render } = await drawn()
    expect([(await row()).bibleWhy, (await row()).wordsChanged, render()]).toEqual([undefined, undefined, null])
    expect(boardRow(t.pub, readTake(t.pub, t.take.id)!, readBibleFile(t.pub, t.take.worldId)).state).toBe('drawn')
    setTakeWords(t.pub, t.take.id, 'A crowded market at dusk.')
    expect([(await row()).bibleWhy, (await row()).wordsChanged, (await row()).approved, render()]).toEqual([undefined, true, true, null])
    expect(readiness(t.pub, t.take.id).missing.map((m) => m.code)).toContain('words_changed') // (this rig prepares no frames)
    expect(boardRow(t.pub, readTake(t.pub, t.take.id)!, readBibleFile(t.pub, t.take.worldId)).state).toBe('drawn')
    setTakeWords(t.pub, t.take.id, OWN) // back to the words it was drawn from: nothing to ask
    expect([(await row()).wordsChanged, readiness(t.pub, t.take.id).missing.map((m) => m.code)]).toEqual([undefined, ['no_clay']])
  })

  it('a scene prompt edit leaves the take (and its still) alone and says "scene prompt changed"', async () => {
    const { t, listed, render } = await drawn()
    const store = new BibleStore(t.pub)
    expect((await handleBible({ store }, 'POST', '', new URLSearchParams(), { worldId: t.kit.id, prompt: 'A quiet harbour at night.' })).status).toBe(200)
    expect([await listed(), render()]).toEqual([null, null])
    const take = readTake(t.pub, t.take.id)!
    expect(take.prompt).toBe(OWN)
    expect(boardRow(t.pub, take, readBibleFile(t.pub, t.take.worldId)).sceneChanged).toBe(true)
  })
})
