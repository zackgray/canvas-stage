// Track C: mid / end keyframes in Render. A stale or foreign keyframe is refused before any spend; a fresh one reaches the
// graph and the record; the chip strip lists exactly what the submitted graph binds; the Bible-composed prompt and @tag override.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { HeroStill } from '../../../src/shared/shotContract.ts'
import type { RefChip } from '../../../src/studio/render/l2rExtra.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { resetFinishing } from '../finish.ts'
import { bibleOn, FRAMES, KEY, mount, stampStills, STILL, TAKE, until, WORLD, world, type World } from './rig.ts'

// A1 builds the real composePrompt; here a stand-in that expands @tags from the elements' lines
vi.mock('../../bible/prompt.ts', async () => {
  const { BIBLE_TAG_RE } = await import('../../../src/shared/bibleContract.ts')
  return {
    composePrompt: ({ bible, fallback, action }: { bible: BibleRecord | null; fallback?: string | null; action?: string | null }) => {
      const tags: string[] = [], unknown: string[] = []
      const body = (bible?.prompt || fallback || '').replace(BIBLE_TAG_RE, (_m, t: string) => {
        const e = bible?.elements.find((x) => x.tag === t)
        if (!e) { unknown.push(t); return '' }
        tags.push(t); return e.line
      })
      return { text: [body, bible?.lighting, bible?.materials, action].map((s) => s?.trim()).filter(Boolean).join(' '), tags, unknown }
    },
    backgroundLine: (b: BibleRecord | null) => b?.background ?? '',
  }
})

afterEach(() => { resetClaims(); resetFinishing() })

const bible = (o: Partial<BibleRecord> = {}): BibleRecord => ({ worldId: WORLD, version: 3, prompt: '', master: { id: 'm1', png: '/lab-assets/locations/m.png', madeBy: 'qwen', seed: 1, depthStrength: 1, jobId: null, credits: 0, createdAt: 't' },
  candidates: [], lighting: '', materials: '', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', ...o })
function putBible(w: World, b: BibleRecord) {
  const f = path.join(w.pub, ...biblePaths(WORLD).file.split('/'))
  mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(b))
  const m = path.join(w.pub, 'lab-assets', 'locations', 'm.png'); writeFileSync(m, 'png')
  stampStills(w, b.version) // m5: a still with no Bible version is stale once the Bible has a master
}
function putKey(w: World, id: string, role: 'mid' | 'end', o: Partial<HeroStill> = {}) {
  const s: HeroStill = { id, takeId: TAKE, startKey: KEY, png: `/lab-assets/shots/${TAKE}/hero/${id}.png`, seed: 1, jobId: null, credits: 1, approved: true,
    createdAt: '2026-10-22T19:20:00.000Z', role, frame: role === 'mid' ? 24 : FRAMES - 1, bibleVersion: bibleOn(w), ...o }
  writeFileSync(path.join(w.dirs.hero, `${id}.json`), JSON.stringify(s)); writeFileSync(path.join(w.dirs.hero, `${id}.png`), 'png')
}
const rec = (w: World, id: string) => JSON.parse(readFileSync(path.join(w.dirs.l2r, `${id}.json`), 'utf8'))

describe('keyframes: stale ones are refused before spend', () => {
  const cases: [string, (w: World) => void, RegExp][] = [
    ['drawn for an older opening (startKey)', (w) => putKey(w, 'k-mid', 'mid', { startKey: 'deadbeef' }), /older opening/],
    ['drawn against an older Bible', (w) => { putBible(w, bible({ version: 4 })); putKey(w, 'k-mid', 'mid', { bibleVersion: 3 }) }, /scene sheet version 3.*version 4/],
    ['belongs to another take', (w) => putKey(w, 'k-mid', 'mid', { takeId: 'take-other' }), /another take/],
    ['a frame outside the take', (w) => putKey(w, 'k-mid', 'mid', { frame: 4 }), /outside this take/],
    ['not approved', (w) => putKey(w, 'k-mid', 'mid', { approved: false }), /not this take's approved mid/],
    ['an end still sent as the mid', (w) => putKey(w, 'k-mid', 'end'), /not this take's approved mid/],
  ]
  for (const [name, setup, why] of cases) {
    it(`${name}: 409, nothing submitted or written`, async () => {
      const w = world(); setup(w)
      const r = await mount(w, w.runtime()).render({ mid: 'k-mid' })
      expect(r.status).toBe(409); expect(r.body.code).toMatch(/stale_keyframe|no_keyframe/); expect(r.body.error).toMatch(why)
      expect(w.jobs.submits).toBe(0)
    })
  }
  it('an unknown keyframe id: 409 no_keyframe; mid after end: refused', async () => {
    const w = world(); const m = mount(w, w.runtime())
    expect((await m.render({ end: 'nope' })).body.code).toBe('no_keyframe')
    putKey(w, 'k-mid', 'mid', { frame: 40 }); putKey(w, 'k-end', 'end', { frame: 32 })
    const r = await m.render({ mid: 'k-mid', end: 'k-end' })
    expect([r.status, r.body.code]).toEqual([409, 'stale_keyframe']); expect(w.jobs.submits).toBe(0)
  })
  it('GET shows each keyframe with why it would be refused', async () => {
    const w = world(); putKey(w, 'k-mid', 'mid', { startKey: 'deadbeef' }); putKey(w, 'k-end', 'end')
    const b = (await mount(w, w.runtime()).status()).body
    expect(b.keyframes.mid.stale).toMatch(/older opening/); expect(b.keyframes.end.stale).toBeNull()
    expect(b.still.id).toBe(STILL) // the opening is still the approved opening, never a keyframe
  })
  it('a mid or end approved after the opening never becomes the look: Render sends the approved opening', async () => {
    const w = world(); putKey(w, 'k-mid', 'mid', { createdAt: '2099-01-01T00:00:00.000Z' }); putKey(w, 'k-end', 'end', { createdAt: '2099-01-02T00:00:00.000Z' })
    const m = mount(w, w.runtime())
    expect((await m.status()).body.still.id).toBe(STILL)
    const r = await m.render({ mid: 'k-mid', end: 'k-end' })
    expect(r.status).toBe(200); expect(rec(w, r.body.render.id).stillId).toBe(STILL)
  })
})

describe('keyframes: a fresh pair reaches the graph and the record', () => {
  it('mid at 0.7, end at 1.0, chained after the look on both stages; recorded on the render; the strip lists the binds', async () => {
    const w = world(); putBible(w, bible({ elements: [{ tag: 'ana', kind: 'cast', cardId: 'c1', refs: ['/f.png', '/g.png'], line: 'Ana' }] }))
    putKey(w, 'k-mid', 'mid', { bibleVersion: 3 }); putKey(w, 'k-end', 'end', { bibleVersion: 3 })
    const m = mount(w, w.runtime())
    const r = await m.render({ mid: 'k-mid', end: 'k-end' })
    expect(r.status).toBe(200)
    const g = w.submitted[0].json
    expect([g.m1_t.inputs.frame_idx, g.m1_t.inputs.strength, g.e1_t.inputs.frame_idx, g.e1_t.inputs.strength]).toEqual([24, 0.7, FRAMES - 1, 1])
    expect(g.gd1_t.inputs.positive).toEqual(['e1_t', 0]); expect(g.gd2_t.inputs.positive).toEqual(['e2_t', 0])
    expect(rec(w, r.body.render.id).keyframes).toEqual([{ stillId: 'k-mid', role: 'mid', frame: 24, strength: 0.7 }, { stillId: 'k-end', role: 'end', frame: FRAMES - 1, strength: 1 }])
    await until(() => !!rec(w, r.body.render.id).finished)

    const chips = (await m.status()).body.chips as RefChip[]
    const sent = chips.filter((c) => c.sent)
    const loaders = Object.entries(g).filter(([, n]) => /^Load(Image|Video)$/.test(n.class_type as string)).map(([id, n]) => `${id}.${n.class_type === 'LoadVideo' ? 'file' : 'image'}`)
    expect(sent.map((c) => c.bind).sort()).toEqual(loaders.sort()) // the strip says exactly what binds sent
    expect(sent.map((c) => c.role)).toEqual(['layout', 'opening', 'mid', 'end'])
    expect(chips.filter((c) => !c.sent).map((c) => c.role)).toEqual(['master', 'face', 'gear'])
  })
  it('no keyframes: the graph has none, the record has no keyframes or grade, the strip is just the clay and the opening', async () => {
    const w = world(); const m = mount(w, w.runtime()); const r = await m.render()
    expect(Object.keys(w.submitted[0].json).filter((k) => /^k[me]|^[me][12]_/.test(k))).toEqual([])
    expect(rec(w, r.body.render.id)).not.toHaveProperty('keyframes'); expect(rec(w, r.body.render.id)).not.toHaveProperty('grade')
    expect(((await m.status()).body.chips as RefChip[]).map((c) => c.role)).toEqual(['layout', 'opening'])
  })
})

describe('the composed prompt and the @tag override', () => {
  it('the take\'s action and the Bible join the default prompt', async () => {
    const w = world(); putBible(w, bible({ prompt: 'Rain on a market.', lighting: 'Cold dusk.' }))
    const t = JSON.parse(readFileSync(w.dirs.take, 'utf8')); writeFileSync(w.dirs.take, JSON.stringify({ ...t, action: 'He stops and looks up.' }))
    const b = (await mount(w, w.runtime()).status()).body
    expect(b.prompt).toBe('Rain on a market. Cold dusk. He stops and looks up.')
  })
  it('an override\'s @tags are expanded from the Bible, then it goes verbatim (owner decision 1); the preview route shows it free', async () => {
    const w = world(); putBible(w, bible({ elements: [{ tag: 'ana', kind: 'cast', cardId: 'c1', refs: [], line: 'a tired courier in a green coat' }] }))
    const m = mount(w, w.runtime())
    expect((await m.post('/prompt', { takeId: TAKE, text: '@ana runs, a campfire behind her' })).body).toMatchObject({ text: 'A tired courier in a green coat runs, a campfire behind her', tags: ['ana'], unknown: [] })
    expect(w.jobs.submits).toBe(0)
    await m.render({ prompt: '@ana runs, a campfire behind her' })
    expect(w.submitted[0].json.p0.inputs.text).toBe('A tired courier in a green coat runs, a campfire behind her')
  })
  it('an @tag the Bible does not have is refused (400), free', async () => {
    const w = world(); putBible(w, bible()); const m = mount(w, w.runtime())
    const r = await m.render({ prompt: '@ghost walks' })
    expect([r.status, r.body.code]).toEqual([400, 'unknown_tag']); expect(r.body.error).toMatch(/@ghost/); expect(w.jobs.submits).toBe(0)
  })
  it('with no Bible and no action the default prompt is exactly what it was', async () => {
    const w = world(); const b = (await mount(w, w.runtime()).status()).body
    expect(b.prompt).toMatch(/^A muddy medieval battlefield|^A cinematic shot|Real live-action footage/)
  })
})
