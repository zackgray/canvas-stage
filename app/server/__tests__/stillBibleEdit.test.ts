// F1 (prompt-wave fix pass), on the real path: a v2 brief saved through the Bible's save route, a kit still drawn by the real press
// (fake Cloud) and approved, then Brief detail edits made with the page's own edit and save functions (editAt, saveBriefToBible).
// An edit that only feeds the render (a beat's wording, the camera move) leaves the approved still ready on Render and unflagged on
// Shoot; an edit of the light stales it on both with the same reason; undoing the edit frees it again (the Bible's version still
// moves on every save, and `user` keeps growing). Nothing paid.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BibleResponse } from '../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../src/shared/briefContract.ts'
import type { HeroListResponse } from '../../src/shared/shotContract.ts'
import type { BibleApi } from '../../src/studio/scene/bibleApi.ts'
import { saveBriefToBible } from '../../src/studio/scene/briefApi.ts'
import { editAt } from '../../src/studio/scene/design/briefV2.ts'
import { handleBible } from '../bible/routes.ts'
import { BibleStore } from '../bible/store.ts'
import { kitInfo, kitTake, pngJob, stillPng } from '../hero/__tests__/kitRig.ts'
import { mount } from '../hero/__tests__/rig.ts'
import type { KitStill } from '../hero/kitSpec.ts'
import { readiness } from '../l2r/inputs.ts'

const el = (tag: string, type: 'person' | 'prop', o: Partial<SceneBriefV2['elements'][number]> = {}) =>
  ({ name: tag, tag, type, look: `${tag}, as described`, supported: true, materials: '', condition: '', face: '', ...o })
const BRIEF: SceneBriefV2 = {
  logline: '@ana pushes @bicycle up a country lane',
  place: { setting: 'a country lane between hedges', period: '', season: 'spring', time: 'early morning', weather: 'misty' },
  light: { key: 'low morning sun', direction: 'behind her, towards camera', height: 'low', quality: 'soft', colour: 'pale gold', others: '', effect: '' },
  atmosphere: [{ what: 'mist', where: 'drifting low over the lane' }],
  elements: [el('ana', 'person', { name: 'Ana' }), el('bicycle', 'prop', { name: 'The bicycle', materials: 'a steel frame, a wicker basket' })],
  beats: [{ who: '@ana', does: 'pushes the bicycle up the lane', seconds: 3, visible: '' }],
  camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '', background: '', exclude: [], warnings: [], developed: [],
}

async function scene() {
  const t = kitTake({ bible: {} })
  writeFileSync(path.join(t.clayDir, 'clay.mp4'), 'clay') // Render's readiness needs the clay's video on disk
  const store = new BibleStore(t.pub)
  const route = (method: string, sub: string, body: Record<string, unknown>, q = new URLSearchParams()) => handleBible({ store }, method, sub, q, body)
  expect((await route('POST', '', { worldId: t.kit.id, prompt: BRIEF.logline, brief: BRIEF })).status).toBe(200)
  for (const element of [{ tag: 'ana', kind: 'cast', cardId: 'ana', refs: [], line: '' }, { tag: 'bicycle', kind: 'prop', refs: [], line: '' }]) {
    expect((await route('POST', '/element', { worldId: t.kit.id, element })).status).toBe(200)
  }
  // the page's Bible calls, answered by the real route (only the two saveBriefToBible makes)
  const api = {
    get: async (world: string) => (await route('GET', '', {}, new URLSearchParams({ world }))).body as BibleResponse,
    save: async (req) => (await route('POST', '', req as unknown as Record<string, unknown>)).body as BibleResponse,
  } as Pick<BibleApi, 'get' | 'save'> as BibleApi
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000a01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-000000000a02', stillPng()))
  const hero = mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
  const drawn = await hero.render()
  expect(drawn.status, JSON.stringify(drawn.body)).toBe(200)
  const still = (drawn.body as { still: KitStill }).still
  expect((await hero.approve(still.id)).status).toBe(200)
  let brief = BRIEF
  /** one Brief detail row edit, as BriefDetail saves it once the edits settle */
  const edit = async (p: string, value: unknown) => { brief = editAt(brief, p, value); await saveBriefToBible(api, t.kit.id, brief) }
  /** what Render says (the opening still's refusal, if any) and what Shoot's list says about the still */
  const both = async () => {
    const render = readiness(t.pub, t.take.id).missing.find((m) => m.code === 'stale_still')?.message ?? null
    const listed = ((await hero.list()).body as unknown as HeroListResponse).stills.find((s) => s.id === still.id)!
    return { render, shoot: listed.bibleWhy ?? null, approved: listed.approved }
  }
  return { t, store, edit, both, still }
}

describe('F1: an approved still goes stale only when what it was drawn from changes', () => {
  it('render-only edits leave it ready; a light edit stales it on Shoot and Render alike; the undo frees it', async () => {
    const { t, store, edit, both, still } = await scene()
    expect(still.bibleKeys).toBeTruthy()
    const v0 = (await store.get(t.kit.id))!.version
    expect(readiness(t.pub, t.take.id).missing).toEqual([]) // ready to render as drawn
    expect(await both()).toEqual({ render: null, shoot: null, approved: true })

    await edit('beats.0.does', 'wheels the bicycle slowly up the lane')
    await edit('camera.move', 'slow push in')
    expect((await store.get(t.kit.id))!.version).toBeGreaterThan(v0) // the Bible did move on
    expect(readiness(t.pub, t.take.id).missing).toEqual([])
    expect(await both()).toEqual({ render: null, shoot: null, approved: true })

    await edit('light.direction', 'from the left of frame')
    const stale = await both()
    expect(stale.shoot).toMatch(/^The brief's light changed after this still was drawn$/)
    expect(stale.render).toBe(`The approved still is out of date: ${stale.shoot}.`)

    await edit('light.direction', BRIEF.light.direction) // undone: the brief's light is what the still was drawn from again
    expect((await store.get(t.kit.id))!.brief!.user).toContain('light.direction')
    expect(readiness(t.pub, t.take.id).missing).toEqual([])
    expect(await both()).toEqual({ render: null, shoot: null, approved: true })
  })

  it('a still drawn before keys were recorded keeps the version rule', async () => {
    const { t, both, still, edit } = await scene()
    const f = path.join(t.heroDir, `${still.id}.json`)
    const { bibleKeys: _k, ...old } = JSON.parse((await import('node:fs')).readFileSync(f, 'utf8')) as KitStill
    writeFileSync(f, JSON.stringify(old))
    await edit('camera.move', 'slow push in')
    const r = await both()
    expect(r.shoot).toMatch(/drawn against scene sheet version \d+; the scene is on version \d+ now/)
    expect(r.render).toBe(`The approved still is out of date: ${r.shoot}.`)
  })
})
