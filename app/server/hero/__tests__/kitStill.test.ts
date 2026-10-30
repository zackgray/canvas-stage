// The kit still (track B): a press on a kit take whose clay has metric depth draws with Qwen-Image 2512 locked to that depth,
// then finishes with Klein (face + gear + master), for the opening, mid or end keyframe; the layout check flags a still that
// does not sit on the clay; the colour-match never fails a paid still. All over the fake Cloud: no network, no credits.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { KitStill } from '../kitSpec.ts'
import { kitInfo, kitTake, masterOf, pngJob, stillPng, type KitTake } from './kitRig.ts'
import { mount } from './rig.ts'

type Sent = { json: Record<string, { class_type?: string; inputs: Record<string, unknown> }> }
const nodesOf = (s: Sent, cls: string) => Object.values(s.json).filter((n) => n.class_type === cls)
const drawText = (s: Sent) => String(s.json.pos.inputs.text)
const good = () => stillPng()
const drifted = () => stillPng({ x0: 0, x1: 50, y0: 8, y1: 100 }) // a tall wall on the left where the clay has a box in the middle

function press(t: KitTake, body: object = {}, finish = good(), deps: object = {}) {
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000a01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-000000000a02', finish))
  return mount(t, t.runtime({ fetchInfo: async () => kitInfo() }), deps).render(body)
}
const stillOf = (r: { body: unknown }) => (r.body as { still: KitStill }).still

describe('kit still: depth-locked Qwen draw, then the Klein finish', () => {
  it('opening: two jobs (Qwen on the frame-0 depth, then Klein with face + gear), 1920x1088, role and frame recorded, priced 14 + 2', async () => {
    const t = kitTake()
    const r = await press(t)
    expect(r.status).toBe(200)
    expect(t.jobs.submits).toBe(2)
    const [draw, fin] = t.submitted as Sent[]
    // E130: the Fun ControlNet Union, not the DiffSynth patch; recipe (E139 M2): the photographic lock, 0.65 released at 0.50
    expect(nodesOf(draw, 'ControlNetApplyAdvanced')[0].inputs).toMatchObject({ strength: 0.65, start_percent: 0, end_percent: 0.5 })
    expect(nodesOf(draw, 'QwenImageDiffsynthControlnet')).toEqual([])
    expect(nodesOf(draw, 'ImageScale').map((n) => [n.inputs.width, n.inputs.height])).toEqual([[1664, 944], [1920, 1088]])
    expect(nodesOf(fin, 'EmptyFlux2LatentImage')[0].inputs).toMatchObject({ width: 1920, height: 1088 })
    expect(nodesOf(fin, 'ImageScaleToTotalPixels').map((n) => n.inputs.megapixels).sort()).toEqual([0.5, 0.5, 1]) // face, gear at 0.5 MP; the draw at 1
    const s = stillOf(r)
    expect(s).toMatchObject({ role: 'opening', frame: 0, castId: 'ana', madeBy: 'qwen-image-2512+union-depth -> klein-4b', depthStrength: 0.65, depthEnd: 0.5, lockPreset: 'photographic', materials: [] })
    expect(s.layout).toMatchObject({ ok: true })
    expect(s.grade).toMatchObject({ skipped: expect.stringMatching(/no master or opening still/) })
    expect(existsSync(path.join(t.heroDir, 'depth-000.png'))).toBe(true) // the depth patch's input, made from the zdepth
  })

  it('the draw prompt (no v2 brief): who, doing what, where, with no lead; the figure\'s size and place; visible pieces plainly; no light table, stock or mm', async () => {
    const t = kitTake()
    await press(t)
    const text = drawText(t.submitted[0] as Sent)
    // the person and their action first, then the plan sentence's first clause, not its list of things
    expect(text).toMatch(/^A battle-worn woman [^.]* walking towards us, a muddy medieval battlefield at dusk\./)
    expect(text).not.toMatch(/burning palisade|broken fences|smoke on the horizon/) // E130 b2: background claims inflate the set
    expect(text).toMatch(/of the frame, (far away, )?one [a-z ]*figure seen whole, [a-z ]+ of the frame tall\./) // size + place (E130)
    expect(text.match(/battle-worn woman/g)).toHaveLength(1) // m2: the cast is described once
    expect(text).not.toMatch(/alone in the picture|^Photo|A photograph\./)
    expect(text).not.toMatch(/the only light|Hard low sun|Kodak|vision3|\d\s?mm\b|weathered/i) // prompt wave: no canned light, stock, mm or age
    expect(text).not.toMatch(/cinema lens|Deep focus|real photograph|Real photographic|grain/i) // E130 caption; E16/E18 realism tags
    expect(text).not.toMatch(/tall pointed log palisade|on the left/i) // P1: no sizes or places for the set
    const card = String(nodesOf(t.submitted[1] as Sent, 'CLIPTextEncode').find((n) => n.inputs.text)!.inputs.text)
    expect(card).toMatch(/^A real photograph: image 1 exactly as it is/)
  })

  it('with a Bible: its version is recorded, its master goes to Klein as image 4 and is the colour-match target; the place and the lines go in', async () => {
    const t = kitTake({ bible: { prompt: 'A cold dawn over the ford: rotten pilings, a sunk boat. @ana wades in.', lighting: 'Flat grey light.', version: 3,
      elements: [{ tag: 'ana', kind: 'cast', cardId: 'ana', refs: [], line: '' }] } })
    const bp = path.join(t.pub, 'lab-assets', 'locations', t.kit.id, 'bible', 'bible.json')
    writeFileSync(bp, JSON.stringify({ ...JSON.parse(readFileSync(bp, 'utf8')), master: masterOf(t.kit.id) }))
    const r = await press(t)
    const s = stillOf(r)
    expect(s.bibleVersion).toBe(3)
    const text = drawText(t.submitted[0] as Sent)
    // stage-only: the scene words lead as written (every clause kept, the tag replaced by the card's description); the flat lighting line
    // is no longer added on top of them
    expect(text).toMatch(/^A cold dawn over the ford: rotten pilings, a sunk boat\. A battle-worn woman [^.]* wades in\./)
    expect(text).not.toMatch(/Flat grey light/)
    expect(nodesOf(t.submitted[1] as Sent, 'ReferenceLatent').length).toBe(8) // 4 images, positive and negative
    expect(s.grade).toMatchObject({ target: masterOf(t.kit.id).png, skipped: expect.stringMatching(/colormatch\.py is not installed/) })
  })

  it('prompt wave: the still says the take\'s written action, and the hero\'s beat in the v2 brief before it (the motion word is the fallback)', async () => {
    const t = kitTake({ bible: { elements: [{ tag: 'ana', kind: 'cast', cardId: 'ana', refs: [], line: '' }] } })
    const tf = path.join(t.shot, 'take.json')
    writeFileSync(tf, JSON.stringify({ ...JSON.parse(readFileSync(tf, 'utf8')), action: 'She kneels and digs a shard out of the mud.' }))
    await press(t)
    const text = drawText(t.submitted[0] as Sent)
    expect(text).toContain('She kneels and digs a shard out of the mud.')
    expect(text).not.toMatch(/walking towards us/)
    const bp = path.join(t.pub, 'lab-assets', 'locations', t.kit.id, 'bible', 'bible.json')
    const brief = { logline: '', place: { setting: 'a ford at dawn', period: '', season: '', time: '', weather: '' }, light: { key: '', direction: '', height: '', quality: '', colour: '', others: '', effect: '' },
      atmosphere: [], elements: [], beats: [{ who: '@ana', does: 'wades into the river', seconds: 4, visible: 'gasping at the cold' }], camera: { size: '', angle: '', move: '', lensFeel: '' },
      style: '', background: '', exclude: [], warnings: [], developed: [] }
    writeFileSync(bp, JSON.stringify({ ...JSON.parse(readFileSync(bp, 'utf8')), brief }))
    await press(t)
    const beat = drawText(t.submitted[2] as Sent)
    expect(beat).toMatch(/Ana wades into the river, gasping at the cold\./)
    expect(beat).toMatch(/ in a ford at dawn\./)
    expect(beat).not.toMatch(/She kneels|walking towards us/)
  })

  it('M1: a scene prompt naming a tag no reference answers to is refused (409 unknown_tag) before any intent or spend', async () => {
    const t = kitTake({ bible: { prompt: 'A burnt field. @rosa walks the fence line while @dragon circles.', elements: [{ tag: 'rosa', kind: 'cast', cardId: 'ana', refs: [], line: '' }] } })
    const r = await mount(t, t.runtime({ fetchInfo: async () => kitInfo() })).render({})
    expect([r.status, r.body.code, t.jobs.submits]).toEqual([409, 'unknown_tag', 0])
    expect(r.body.error).toMatch(/@dragon/)
    expect(existsSync(t.heroDir) ? readdirSync(t.heroDir).filter((f) => f.startsWith('intent-')) : []).toEqual([])
  })

  it('the colour-match runs track D\'s script with LIFT_PYTHON when it is there; a failing run keeps the paid still', async () => {
    const t = kitTake({ bible: {} })
    const bp = path.join(t.pub, 'lab-assets', 'locations', t.kit.id, 'bible', 'bible.json')
    writeFileSync(bp, JSON.stringify({ ...JSON.parse(readFileSync(bp, 'utf8')), master: masterOf(t.kit.id) }))
    mkdirSync(path.join(t.root, 'scripts', 'l2r'), { recursive: true }); writeFileSync(path.join(t.root, 'scripts', 'l2r', 'colormatch.py'), '#')
    const calls: string[][] = []
    const run = async (_py: string, args: string[]) => { calls.push(args); writeFileSync(args[args.indexOf('--out') + 1], readFileSync(args[args.indexOf('--in') + 1])) }
    const r = await press(t, {}, good(), { appDir: t.root, python: () => 'py', runPython: run })
    expect(stillOf(r).grade).toEqual({ target: masterOf(t.kit.id).png, method: 'reinhard-lab' })
    expect(calls[0].slice(1, 3)).toEqual(['--target', path.join(t.pub, 'lab-assets', 'locations', t.kit.id, 'bible', 'master', 'm1.png')])
    const r2 = await press(t, {}, good(), { appDir: t.root, python: () => 'py', runPython: async () => { throw new Error('No module named cv2') } })
    expect([r2.status, stillOf(r2).grade?.skipped]).toEqual([200, expect.stringMatching(/cv2/)])
  })

  it('mid and end: the 8-grid middle and the depth of the last clay frame; a picked mid frame needs its own depth (none here: 409, nothing spent)', async () => {
    const t = kitTake()
    // 25 frames: the middle is 12, off the 8-grid Render sends keyframes on (M2), so the mid is drawn on 8
    expect(stillOf(await press(t, { role: 'mid' }))).toMatchObject({ role: 'mid', frame: 8 })
    expect(stillOf(await press(t, { role: 'end' }))).toMatchObject({ role: 'end', frame: 24 })
    const before = t.jobs.submits
    const r = await mount(t, t.runtime({ fetchInfo: async () => kitInfo() })).render({ role: 'mid', frame: 16 })
    expect([r.status, r.body.code, t.jobs.submits]).toEqual([409, 'no_depth', before])
    // an off-grid frame is refused outright (400, free): Render could never send it
    const off = await mount(t, t.runtime({ fetchInfo: async () => kitInfo() })).render({ role: 'mid', frame: 12 })
    expect([off.status, off.body.code, t.jobs.submits]).toEqual([400, 'bad_request', before])
  })

  it('the layout check flags a still whose edges do not sit on the clay\'s (P1), with its score; the still is kept', async () => {
    const t = kitTake()
    const s = stillOf(await press(t, {}, drifted()))
    expect(s.layout).toMatchObject({ ok: false, message: expect.stringMatching(/may be missing the hero/) })
    expect(s.layout!.score).toBeLessThan(0.38)
    expect(existsSync(path.join(t.heroDir, `${s.id}.json`))).toBe(true)
  })

  it('material references: a Bible material tag goes to Klein as an extra image; an unknown tag is refused before any spend', async () => {
    const t = kitTake({ bible: { elements: [{ tag: 'mud', kind: 'material', refs: ['/lab-assets/tiles/mud.png'], line: 'Wet trampled mud: puddles and boot prints.' }] } })
    mkdirSync(path.join(t.pub, 'lab-assets', 'tiles'), { recursive: true }); writeFileSync(path.join(t.pub, 'lab-assets', 'tiles', 'mud.png'), stillPng())
    const r = await press(t, { materials: ['mud'] })
    expect(r.status).toBe(200)
    expect(Object.keys((t.submitted[1] as Sent).json)).toContain('rt0')
    // prompt wave: the clause names the object in image 1 the material dresses
    expect(String(nodesOf(t.submitted[1] as Sent, 'CLIPTextEncode').find((n) => n.inputs.text)!.inputs.text))
      .toMatch(/The wet trampled mud in image 1 has the surface of image 4: only its material texture/)
    const bad = await mount(t, t.runtime({ fetchInfo: async () => kitInfo() })).render({ materials: ['gravel'] })
    expect([bad.status, t.jobs.submits]).toEqual([400, 2])
  })

  it('no clay depth: every kit still is refused (409 no_depth, nothing spent; no one-step fallback); a bad role is a 400', async () => {
    const t = kitTake({ depth: false })
    const hero = mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
    const r = await hero.render()
    expect([r.status, r.body.code, t.jobs.submits]).toEqual([409, 'no_depth', 0])
    expect(r.body.error).toMatch(/Prepare the frames.*Nothing was billed/)
    expect((await hero.render({ role: 'middle' })).status).toBe(400)
  })

  it('approve is one per role: approving a mid keeps the approved opening', async () => {
    const t = kitTake()
    const open = stillOf(await press(t))
    const mid = stillOf(await press(t, { role: 'mid' }))
    const hero = mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
    await hero.approve(open.id); await hero.approve(mid.id)
    const list = (await hero.list()).body as { stills: KitStill[] }
    expect(list.stills.filter((s) => s.approved).map((s) => s.role).sort()).toEqual(['mid', 'opening'])
  })
})
