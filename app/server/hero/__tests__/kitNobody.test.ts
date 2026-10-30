// No-person shots (owner 2026-10-29, a tyre close-up): with no one cast and the performer out of the still's frame, Draw the first
// frame draws with nobody in it (no face, no card, no person words; the price and the set/layout checks as ever) and Render takes
// that still with a prompt naming no one. With the performer IN the frame and nobody cast the press is refused as before (free),
// now saying the way out. Fake Cloud: no network, no credits.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import { NO_PERSON_LINE } from '../kleinCard.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { KitStore } from '../../stage3d/store.ts'
import { defaultPrompt } from '../../l2r/compose.ts'
import { mount as mountL2R, world as l2rWorld } from '../../l2r/__tests__/rig.ts'
import { QWEN_NEG_PEOPLE } from '../qwenGraph.ts'
import { kitStillCredits, type KitStill } from '../kitSpec.ts'
import { kitInfo, kitTake, pngJob, stillPng, type KitTake } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'

type Sent = { json: Record<string, { class_type?: string; inputs: Record<string, unknown> }> }
const nodesOf = (s: Sent, cls: string) => Object.values(s.json).filter((n) => n.class_type === cls)
const hero = (t: KitTake) => mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
const PERSON = /\b(person|people|figure|woman|man|face|ana|battle-worn|someone|clothes)\b/i

/** the clay's ID pass at frame 0: the hero drawn in red where `heroIn`, else nobody on the frame */
function idPass(t: KitTake, heroIn: boolean) {
  const w = 192, h = 108, png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, on = heroIn && x >= 90 && x < 100 && y >= 40 && y < 100
    png.data[i] = on ? 255 : 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 255
  }
  writeFileSync(path.join(t.clayDir, 'id_000.png'), PNG.sync.write(png))
  const f = path.join(t.clayDir, 'clay.json'), clay = JSON.parse(readFileSync(f, 'utf8'))
  writeFileSync(f, JSON.stringify({ ...clay, idPass: { frames: [0], pattern: 'id_%03d.png', colors: { hero: [255, 0, 0] } } }))
}
function press(t: KitTake) {
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000b01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-000000000b02', stillPng()))
  return hero(t).render({ count: 1 })
}
const preview = (t: KitTake) => hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE, count: 1 }) })

describe('no one cast, nobody in the frame: the first frame is drawn with no person', () => {
  it('the press goes (two jobs, priced as ever); the draw and the finish name no person; no face or gear image; the still records no cast', async () => {
    const t = kitTake({ castId: null }); idPass(t, false)
    const r = await press(t)
    expect(r.status).toBe(200)
    expect(t.jobs.submits).toBe(2)
    const [draw, fin] = t.submitted as Sent[]
    const text = String(draw.json.pos.inputs.text)
    expect(text).not.toMatch(PERSON)
    expect(String(draw.json.neg.inputs.text)).toContain(QWEN_NEG_PEOPLE) // nobody at all on the frame: people go in the negative
    const card = String(nodesOf(fin, 'CLIPTextEncode').find((n) => n.inputs.text)!.inputs.text)
    expect(card).toMatch(/^A real photograph: image 1 exactly as it is\./)
    // (prompt-fix pass) the one person words it has say there is nobody: "There is no person in this shot: do not add anyone."
    expect(card).toContain(NO_PERSON_LINE)
    expect(card.replace(NO_PERSON_LINE, '')).not.toMatch(/\b(person|face|clothes|gear)\b/i)
    expect(nodesOf(fin, 'ImageScaleToTotalPixels').map((n) => n.inputs.megapixels)).toEqual([1]) // the draw only: no face, no gear
    const s = (r.body as { still: KitStill }).still
    expect(s).toMatchObject({ castId: null, role: 'opening', frame: 0 })
    expect(s.layout).toMatchObject({ ok: true }) // the layout check still runs
    rmSync(t.root, { recursive: true, force: true })
  })

  it('the free preview says so (nobody: true) at the press\'s own price, and names no person', async () => {
    const t = kitTake({ castId: null }); idPass(t, false)
    const r = await preview(t)
    expect(r.status).toBe(200)
    const p = r.body as unknown as StillPreviewResponse
    expect([p.nobody, p.price]).toEqual([true, kitStillCredits(1)])
    expect(p.prompt).not.toMatch(PERSON)
    expect(t.jobs.submits).toBe(0)
    rmSync(t.root, { recursive: true, force: true })
  })

  it('a cast take is unchanged: nobody is false and the face goes', async () => {
    const t = kitTake(); idPass(t, true)
    const p = (await preview(t)).body as unknown as StillPreviewResponse
    expect(p.nobody).toBe(false)
    expect(p.finishPrompt).toMatch(/looking like the person in images? 2\b/)
    rmSync(t.root, { recursive: true, force: true })
  })
})

describe('no one cast, the performer IN the frame: refused as before, free, with the way out', () => {
  it('409 no_cast naming both ways out; no intent, no job', async () => {
    const t = kitTake({ castId: null }); idPass(t, true)
    const r = await press(t)
    expect([r.status, r.body.code, t.jobs.submits]).toEqual([409, 'no_cast', 0])
    expect(String(r.body.error ?? r.body.message)).toMatch(/No one plays the person yet: on the Stage pick The subject.*frame the shot without them/)
    expect(existsSync(t.heroDir) ? readdirSync(t.heroDir).filter((f) => f.startsWith('intent-')) : []).toEqual([])
    rmSync(t.root, { recursive: true, force: true })
  })
})

describe('Render with no one cast', () => {
  function l2rNobody(still: { castId?: string | null }) {
    const w = l2rWorld({ still })
    const kit = new KitStore(w.pub).create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]] }, description: 'kit l2r nobody test' })
    const take = { ...w.take, worldId: `locations/${kit.id}`, packId: 'mocap-0000beef' }
    writeFileSync(w.dirs.take, JSON.stringify(take))
    return { w, take }
  }
  it('takes a first frame drawn with no person: past the cast check, and the prompt it sends names no one', async () => {
    const { w, take } = l2rNobody({ castId: null })
    const r = await mountL2R(w, w.runtime()).render()
    expect(r.body.code).not.toBe('no_cast')
    expect(await defaultPrompt(w.pub, take)).not.toMatch(PERSON)
    rmSync(w.root, { recursive: true, force: true })
  })
  it('an older first frame (no cast recorded) is still refused while no one is cast', async () => {
    const { w } = l2rNobody({})
    const r = await mountL2R(w, w.runtime()).render()
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([409, 'no_cast', 0])
    rmSync(w.root, { recursive: true, force: true })
  })
})
