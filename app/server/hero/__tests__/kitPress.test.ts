// The recipe press (recipe wave): the lock preset (photographic by default, tight on request, a raw strength still accepted and held
// to the end), board tiles as material references by default (visible pieces' prop tiles, then materials; [] = none), "draw again
// with this seed", and the FREE press preview that composes exactly what the press sends. Fake Cloud: no network, no credits.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { kitStillCredits, type KitStill } from '../kitSpec.ts'
import { kitInfo, kitTake, pngJob, stillPng, type KitTake } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'

type Sent = { json: Record<string, { class_type?: string; inputs: Record<string, unknown> }> }
const cn = (s: Sent) => s.json.cn.inputs
const kleinText = (s: Sent) => String(Object.values(s.json).find((n) => n.class_type === 'CLIPTextEncode' && n.inputs.text)!.inputs.text)
const hero = (t: KitTake) => mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
function press(t: KitTake, body: object = {}) {
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000a01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-000000000a02', stillPng()))
  return hero(t).render(body)
}
const preview = (t: KitTake, body: object = {}) => hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE, ...body }) })
const stillOf = (r: { body: unknown }) => (r.body as { still: KitStill }).still
/** a Bible with board tiles: a prop tile for the palisade (in the opening's view) and the tents, and a material */
const tiles = { elements: [
  { tag: 'palisade', kind: 'prop' as const, refs: ['/lab-assets/tiles/palisade.png'], line: 'A rotten, moss-green log palisade.' },
  { tag: 'mud', kind: 'material' as const, refs: ['/lab-assets/tiles/mud.png'], line: 'wet trampled mud' },
  { tag: 'banner', kind: 'prop' as const, refs: ['/lab-assets/cast/ana/missing.png'], line: 'a banner' },
] }
/** the tiles' own image files (prompt wave: a tile that IS the cast's face or front file is the same reference, sent once) */
function withTiles<T extends KitTake>(t: T): T {
  mkdirSync(path.join(t.pub, 'lab-assets', 'tiles'), { recursive: true })
  for (const f of ['palisade', 'mud']) writeFileSync(path.join(t.pub, 'lab-assets', 'tiles', `${f}.png`), stillPng())
  return t
}

describe('the press preview warnings (prompt wave, warn-only)', () => {
  const PASTED = 'Kodak, 24mm, golden hour, no people'
  const beat = { who: '@ana', does: 'stops and looks up', seconds: 3, visible: 'yes' }
  it('a pasted prompt gets four warnings (negation, look words, grain, the action); the response carries the Klein finish and face prompts', async () => {
    const t = kitTake({ bible: { ...tiles, brief: { beats: [beat], atmosphere: [], style: '' } } })
    const p = (await preview(t, { prompt: PASTED })).body as unknown as StillPreviewResponse
    expect(p.warnings?.map((w) => w.code).sort()).toEqual(['action', 'fire-grain', 'negation', 'style'])
    expect(p.prompt).toContain('24mm'); expect(p.prompt).toContain('golden hour'); expect(p.prompt).toContain('no people') // what was typed is what goes
    expect(p.finishPrompt).toMatch(/^A real photograph: image 1 exactly as it is/)
    expect(p.faceRedrawPrompt).toMatch(/^A real photograph\. In image 1, redraw only the face/)
    expect(t.jobs.submits).toBe(0)
  })
  it('the composed (app-filled) prompt is not marked pasted, so it never gets the fire / grain warning', async () => {
    const p = (await preview(kitTake({ bible: tiles }))).body as unknown as StillPreviewResponse
    expect(p.warnings?.map((w) => w.code) ?? []).not.toContain('fire-grain')
  })
})

describe('lock presets', () => {
  it('tight is the pre-recipe lock (0.95 to the end); a raw strength is held to the end and recorded as no preset; a bad preset is a free 400', async () => {
    const t = kitTake()
    const tight = stillOf(await press(t, { preset: 'tight', count: 1 }))
    expect(cn(t.submitted[0] as Sent)).toMatchObject({ strength: 0.95, end_percent: 1 })
    expect(tight).toMatchObject({ lockPreset: 'tight', depthStrength: 0.95, depthEnd: 1 })
    const raw = stillOf(await press(t, { depthStrength: 0.8 }))
    expect(cn(t.submitted[2] as Sent)).toMatchObject({ strength: 0.8, end_percent: 1 })
    expect(raw).toMatchObject({ lockPreset: null, depthStrength: 0.8, depthEnd: 1 })
    const bad = await hero(t).render({ preset: 'loose' })
    expect([bad.status, t.jobs.submits]).toEqual([400, 4])
  })
})

describe('board tiles as material references', () => {
  it('none named: the visible piece\'s prop tile goes to Klein (Klein takes 4 images: draw, face, gear, palisade; the material is left out); [] sends none', async () => {
    const t = withTiles(kitTake({ bible: tiles }))
    const s = stillOf(await press(t))
    expect(s.materials).toEqual(['palisade']) // prompt wave, decision 6: at most 4 images, the last material dropped
    expect(Object.keys((t.submitted[1] as Sent).json).filter((k) => k.startsWith('rt') && !k.includes('_'))).toEqual(['rt0'])
    expect(kleinText(t.submitted[1] as Sent)).toMatch(/The palisade in image 1 has the surface of image 4: only its material texture, not its shape, place, light, weather or time of day\./)
    // the draw names the palisade by its board line (the tile's own words)
    expect(String((t.submitted[0] as Sent).json.pos.inputs.text)).toMatch(/Around them: [^.]*a rotten, moss-green log palisade/)
    const none = stillOf(await press(t, { materials: [] }))
    expect(none.materials).toEqual([])
    expect(Object.keys((t.submitted[3] as Sent).json).filter((k) => k.startsWith('rt'))).toEqual([])
  })
  it('a prop tile can be named; a cast tag cannot (free 400)', async () => {
    const t = withTiles(kitTake({ bible: { elements: [...tiles.elements, { tag: 'ana', kind: 'cast' as const, cardId: 'ana', refs: [], line: '' }] } }))
    expect(stillOf(await press(t, { materials: ['palisade'] })).materials).toEqual(['palisade'])
    const bad = await hero(t).render({ materials: ['ana'] })
    expect([bad.status, bad.body.error]).toEqual([400, expect.stringMatching(/not a prop or material board tile/)])
  })
})

describe('draw again with this seed', () => {
  it('a press with a seed and one still draws exactly that seed', async () => {
    const t = kitTake()
    expect(stillOf(await press(t, { seed: 1059417846, count: 1 })).seed).toBe(1059417846)
    expect(Object.values((t.submitted[0] as Sent).json).filter((n) => n.class_type === 'KSampler').map((n) => n.inputs.seed)).toEqual([1059417846])
  })
})

describe('the press preview (free)', () => {
  it('composes exactly what the press sends: prompt, preset, refs, seeds, price, the depth image; no Cloud call, no intent', async () => {
    const t = withTiles(kitTake({ bible: tiles }))
    const r = await preview(t)
    expect(r.status).toBe(200)
    const p = r.body as unknown as StillPreviewResponse
    expect(t.jobs.submits).toBe(0)
    // owner 2026-10-25: one still per press unless the owner asks for two
    expect(p).toMatchObject({ role: 'opening', frame: 0, preset: 'photographic', count: 1, price: kitStillCredits(1), edited: false })
    expect(p.refs.map((c) => [c.tag, c.kind, c.sent])).toEqual([['palisade', 'prop', true], ['mud', 'material', false]]) // 4 images at most
    // the join: what the card left out is a warning, not silent
    expect(p.warnings?.find((w) => w.code === 'refs-dropped')?.message).toBe('1 reference image was left out: a material image (Klein takes 4 images at most, and the master comes first).')
    expect(p.refs[0]).toMatchObject({ url: '/lab-assets/tiles/palisade.png', label: '@palisade · set piece' })
    expect(p.depthUrl).toMatch(/^\/lab-assets\/shots\/take-[\w-]+\/hero\/preview-depth-000\.png\?v=\d+$/)
    expect(existsSync(path.join(t.heroDir, 'preview-depth-000.png'))).toBe(true)
    expect(existsSync(path.join(t.heroDir, 'depth-000.png'))).toBe(false) // the press's own control file is never touched
    await press(t)
    expect(String((t.submitted[0] as Sent).json.pos.inputs.text)).toBe(p.prompt) // the same words go
  })
  it('follows the owner\'s choices: the edited prompt (verbatim), tight, one ref dropped, one seed; mid frame; refusals are the press\'s', async () => {
    const t = withTiles(kitTake({ bible: tiles }))
    const p = (await preview(t, { prompt: 'Photo of Ana, heavy film grain. 50mm lens.', preset: 'tight', materials: ['mud'], count: 1, role: 'mid' })).body as unknown as StillPreviewResponse
    expect(p).toMatchObject({ role: 'mid', frame: 8, preset: 'tight', count: 1, price: kitStillCredits(1), edited: true })
    expect(p.prompt).toBe('Photo of Ana, heavy film grain. 50mm lens.') // owner decision 1: pasted text goes verbatim, warned
    expect(p.composed).toMatch(/^A battle-worn woman /)
    expect(p.composed).not.toMatch(/^Photo of |alone in the picture/)
    expect(p.refs.map((c) => [c.tag, c.sent])).toEqual([['mud', true], ['palisade', false]])
    expect(p.warnings?.map((w) => w.code)).toContain('fire-grain') // pasted grain words are warned about
    expect((await preview(kitTake({ bible: { prompt: 'A field. @ghost walks.' } }))).body.code).toBe('unknown_tag')
    expect((await preview(t, { preset: 'loose' })).status).toBe(400)
    expect((await preview(kitTake({ depth: false }))).body).toMatchObject({ depthUrl: null })
  })
})

describe('"What will be sent" (owner 10-29: every paid job of the press, its exact words)', () => {
  it('the preview lists the draw with its negative and the finish, each exactly as the press then submits it', async () => {
    const t = withTiles(kitTake({ bible: tiles }))
    const p = (await preview(t)).body as unknown as StillPreviewResponse
    expect(p.sent?.map((j) => j.what)).toEqual(['The draw (Qwen-Image 2512, held to the 3D set)', 'Then the finish (FLUX.2 Klein), on each drawing'])
    await press(t, { count: 1 })
    const draw = t.submitted[0] as Sent, finish = t.submitted[1] as Sent
    expect(p.sent![0].prompt).toBe(String(draw.json.pos.inputs.text))
    expect(p.sent![0].negative).toBe(String(draw.json.neg.inputs.text))
    expect(p.sent![1].prompt).toBe(kleinText(finish))
    // nothing the owner rejected rides along unseen
    expect(p.sent![0].prompt).not.toMatch(/^A photograph\.|alone in the picture|the only person in it/)
    expect(p.sent![0].negative).not.toMatch(/a second person|第二个人/)
  })
})

describe('the finish of a styled draw (stage-only: one stated style reaches the Klein card)', () => {
  it('a pasted painting prompt finishes as a picture, not a photograph; a plain one is unchanged; the press sends what the preview shows', async () => {
    const t = kitTake()
    const plain = (await preview(t)).body as unknown as StillPreviewResponse
    expect(plain.finishPrompt).toMatch(/^A real photograph: /)
    const painted = (await preview(t, { prompt: 'An oil painting of a cook standing by a stool.' })).body as unknown as StillPreviewResponse
    expect(painted.finishPrompt).toMatch(/^A picture: /)
    expect(painted.finishPrompt).not.toContain('Real photographic detail.')
    await press(t, { count: 1, prompt: 'An oil painting of a cook standing by a stool.' })
    expect(kleinText(t.submitted[1] as Sent)).toBe(painted.finishPrompt)
  })
})
