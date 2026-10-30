// The prompt wave's chain, end to end on the real path (the join, 2026-10-25): a v2 brief saved through the Bible's own save route,
// then the three prompts read back from disk the way the app reads them: the still's press preview (POST /__lab/hero/preview), the
// master's (POST /__lab/bible/master/preview) and the Render default (GET /__lab/l2r's prompt). Each must carry the brief: the action
// (where a person is in it), the light's direction, the atmosphere, a kit label; none may carry a house default (a stock, a lens in
// millimetres, weathering, an earth bank) or the Guided stepper's labels. Two unrelated briefs (a neutral lane, a sleek showroom), so
// nothing here is tuned to one concept. Fake Cloud, temp files: nothing paid.
import { describe, expect, it } from 'vitest'
import type { SceneBriefV2 } from '../../src/shared/briefContract.ts'
import type { StillPreviewResponse, MasterPreviewResponse } from '../../src/shared/stillPressContract.ts'
import { JSON_LOCAL } from '../project/__tests__/rig.ts'
import { handleBible } from '../bible/routes.ts'
import { previewMaster } from '../bible/masterPreview.ts'
import { BibleStore } from '../bible/store.ts'
import { kitInfo, kitTake } from '../hero/__tests__/kitRig.ts'
import { mount, TAKE } from '../hero/__tests__/rig.ts'
import { defaultPrompt } from '../l2r/compose.ts'
import { KitStore } from '../stage3d/store.ts'
import { approveSetOnDisk } from '../bible/__tests__/approveFixture.ts'

const el = (tag: string, type: 'person' | 'prop', o: Partial<SceneBriefV2['elements'][number]> = {}) =>
  ({ name: tag, tag, type, look: `${tag}, as described`, supported: true, materials: '', condition: '', face: '', ...o })
const NONE = { camera: { size: '', angle: '', move: '', lensFeel: '' as const }, style: '', background: '', exclude: [], warnings: [], developed: [] }

const NEUTRAL: SceneBriefV2 = {
  logline: '@ana pushes @bicycle up a country lane',
  place: { setting: 'a country lane between hedges', period: '', season: 'spring', time: 'early morning', weather: 'misty' },
  light: { key: 'low morning sun', direction: 'behind her, towards camera', height: 'low', quality: 'soft', colour: 'pale gold', others: '', effect: 'a bright edge on her hair' },
  atmosphere: [{ what: 'mist', where: 'drifting low over the lane' }],
  elements: [el('ana', 'person', { name: 'Ana', face: 'freckled, wind-pink cheeks' }), el('bicycle', 'prop', { name: 'The bicycle', materials: 'a steel frame, a wicker basket' })],
  beats: [{ who: '@ana', does: 'pushes the bicycle up the lane', seconds: 3, visible: 'breathing hard' }],
  ...NONE,
}
const SLEEK: SceneBriefV2 = {
  logline: '@ana walks around @car in a showroom',
  place: { setting: 'a glass-walled car showroom', period: 'present day', season: '', time: 'night', weather: '' },
  light: { key: 'cool overhead panel lights', direction: 'from above', height: 'overhead', quality: 'soft', colour: 'cool white', others: '', effect: 'long reflections along the bodywork' },
  atmosphere: [{ what: 'a faint haze', where: 'hanging under the ceiling lights' }],
  elements: [el('ana', 'person', { name: 'Ana' }), el('car', 'prop', { name: 'the sports car', materials: 'gloss red paint, carbon-fibre trim', condition: 'brand new' })],
  beats: [{ who: '@ana', does: 'walks slowly around the car', seconds: 4, visible: '' }],
  ...NONE,
}

/** a house default or a Guided label: never in an app-filled prompt from a brief that does not ask for it */
const HOUSE = [/kodak|vision3|portra|film stock/i, /\d\s?mm\b/i, /weathered/i, /earth bank/i, /\bSet in\b/, /\bCast:/, /\bno people\b/i]

/** the spike's master view on BATTLEFIELD (chest height, 24 mm, down -z): it sees the palisade, which carries the label */
const LOOK = { position: [0.6, 1.5, -7.7] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 24 }

async function chain(brief: SceneBriefV2, label: string, prop: string, more: string[] = []) {
  const t = kitTake({ bible: {}, take: { samples: [{ t: 0, ...LOOK, focus: 6 }, { t: 0.5, ...LOOK }, { t: 1, ...LOOK }], focal: 24, action: '' } })
  new KitStore(t.pub).changeKit(t.kit.id, (plan) => plan.kit.map((k) => (k.kind === 'palisade' ? { ...k, label } : k)))
  approveSetOnDisk(t.pub, t.kit.id) // the relabelled set, approved
  const store = new BibleStore(t.pub)
  const ctx = { store, previewMaster: (b: Parameters<typeof previewMaster>[2], body: unknown) => previewMaster(t.pub, store, b, body) }
  const post = (sub: string, body: Record<string, unknown>) => handleBible(ctx, 'POST', sub, new URLSearchParams(), { worldId: t.kit.id, ...body })
  // the Build-the-set order: the save (prompt, lines, brief), then every element
  const saved = await post('', { prompt: brief.logline, brief })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  for (const element of [{ tag: 'ana', kind: 'cast', cardId: 'ana', refs: [], line: '' }, ...[prop, ...more].map((tag) => ({ tag, kind: 'prop', refs: [], line: '' }))]) {
    expect((await post('/element', { element })).status).toBe(200)
  }
  const hero = mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
  const still = await hero.raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE }) })
  expect(still.status, JSON.stringify(still.body)).toBe(200)
  const master = await post('/master/preview', {})
  expect(master.status).toBe(200)
  return {
    still: (still.body as unknown as StillPreviewResponse).prompt,
    master: (master.body as MasterPreviewResponse).prompt,
    render: await defaultPrompt(t.pub, t.take),
    submits: t.jobs.submits,
  }
}

const clean = (text: string) => { for (const re of HOUSE) expect(text, `${re} in: ${text}`).not.toMatch(re) }

const WHO = 'battle-worn woman in her thirties with short dark hair and a dented steel helmet' // the kit rig's card, its first sentence

describe('the brief reaches every paid prompt (still, master, render) through the real Bible save', () => {
  // The scene words lead the still and the render (stage-only plan, section 5): the logline as the Bible keeps it, each @tag said in
  // words (the person by the card's who-phrase, a prop by its name); the structured light, air and beats are not repeated over them.
  // The master has no person and no words of its own: it still reads the brief's place, light and air.
  it('a neutral brief: the words lead the still and the render, said in words; the master keeps the sun behind, the mist and the hedge label; no house words', async () => {
    const p = await chain(NEUTRAL, 'a tall hawthorn hedge', 'bicycle')
    expect(p.submits).toBe(0)
    expect(p.still).toMatch(new RegExp(`^A ${WHO} pushes the bicycle up a country lane\\.`))
    expect(p.still).toMatch(/a tall hawthorn hedge/)
    expect(p.master).toMatch(/from the far side/) // nobody in a master: "behind her" is said as the far side
    expect(p.master).toMatch(/\bmist\b/i)
    expect(p.master).toMatch(/a tall hawthorn hedge/)
    expect(p.master).not.toMatch(/pushes|\bher\b/)
    expect(p.render).toMatch(new RegExp(`^A ${WHO} pushes the bicycle up a country lane\\.`))
    for (const x of [p.still, p.render]) expect(x).not.toMatch(/Keep the same|as the driver|Match the first frame|Photoreal|A photograph\.|camera holds still/) // the app adds nothing
    // words given: the structured light, air and beat are not said over them
    for (const x of [p.still, p.render]) expect(x).not.toMatch(/behind her, towards camera|\bmist\b|up the lane|breathing hard/i)
    for (const x of [p.still, p.master, p.render]) { clean(x); expect(x).not.toMatch(/\bthe the\b|@/i) } // a name led by an article is not doubled
  })
  it('a sleek brief: the words lead, the car by its name; the master keeps the light from above, the haze and the glass label; nothing aged', async () => {
    const p = await chain(SLEEK, 'a long glass partition', 'car')
    expect(p.still).toMatch(new RegExp(`^A ${WHO} walks around the sports car in a showroom\\.`))
    expect(p.still).toMatch(/a long glass partition/)
    expect(p.master).toMatch(/from above/)
    expect(p.master).toMatch(/haze/)
    expect(p.master).toMatch(/a long glass partition/)
    expect(p.render).toMatch(new RegExp(`^A ${WHO} walks around the sports car in a showroom\\.`))
    expect(p.render).not.toMatch(/Keep the same|as the driver/)
    for (const x of [p.still, p.render]) expect(x).not.toMatch(/from above|haze|walks slowly/i)
    for (const x of [p.still, p.master, p.render]) { clean(x); expect(x).not.toMatch(/\b(rust\w*|patina|aged|grimy|peeling)\b/i) }
  })
  it('F3: words that tag their objects read with their articles in the still and the render ("the bicycle", "the field gate")', async () => {
    const tagged: SceneBriefV2 = { ...NEUTRAL, logline: '@ana wheels @bicycle through @field_gate',
      elements: [...NEUTRAL.elements, el('field_gate', 'prop', { name: 'Field gate' })],
      beats: [{ who: '@ana', does: 'wheels @bicycle through @field_gate', seconds: 3, visible: '' }] }
    const p = await chain(tagged, 'a tall hawthorn hedge', 'bicycle', ['field_gate']) // every tag the words name has its tile
    expect(p.still).toMatch(new RegExp(`A ${WHO} wheels the bicycle through the field gate`))
    expect(p.render).toMatch(/wheels the bicycle through the field gate/)
    for (const x of [p.still, p.render]) expect(x).not.toMatch(/wheels bicycle|through field gate|@/)
  })
  it('a film stock named in the brief\'s style goes to all three (the one place a stock may come from), fire words and all: nothing the user wrote is scrubbed', async () => {
    const p = await chain({ ...NEUTRAL, style: 'shot on Kodak Portra 400, soft film grain, a firelit glow' }, 'a tall hawthorn hedge', 'bicycle')
    for (const x of [p.still, p.master, p.render]) expect(x).toMatch(/Kodak Portra 400, soft film grain, a firelit glow/)
  })
})
