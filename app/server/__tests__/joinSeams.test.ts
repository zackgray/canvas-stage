// The joining track's intersection tests on the prompt side (2026-10-29), each running the real path across the parts several tracks
// built, on one fixture in neutral nouns. Pure: no files, nothing paid.
//   words to prompts: the drawer's text as the sheet sync writes it (the client's biblePrompt) reaches the draw and the render, and
//     a still drawn before the edit reads as behind;
//   style across every prompt: one stated medium drops the photo lead, the closers and the photo-look negative everywhere;
//   the look frame: the client's press body and the server's parser agree on `sameLook`;
//   saved data: what the new client writes for a person's card and a design parses with the rules the old code reads by.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import { stillBibleKeys, stillBibleWhy } from '../../src/shared/stillBible.ts'
import { EXTRA_COSTUME } from '../../src/stage3d/contract.ts'
import { WALK_TOWARD } from '../../src/stage3d/presets.ts'
import { seededDesign } from '../../src/studio/home/startScene.ts'
import { briefApi } from '../../src/studio/scene/briefApi.ts'
import { biblePrompt } from '../../src/studio/scene/design/briefText.ts'
import { mkPiece } from '../../src/studio/scene/design/model.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import type { KitWorld } from '../stage3d/types.ts'
import { frontPrompt } from '../cast/prompts.ts'
import { parseKitFields } from '../hero/kitInputs.ts'
import { buildDrawPrompt, drawStyled, type StillPromptParts } from '../hero/kitStillPrompt.ts'
import { buildCardPrompt } from '../hero/kleinCard.ts'
import { buildQwenDepthGraph, qwenNegative } from '../hero/qwenGraph.ts'
import { stagedDefault } from '../l2r/stagedDefault.ts'
import { conceptPrompt } from '../scene/conceptGraph.ts'
import { parsePerformancePlan } from '../stage3d/perf.ts'

const CARD = 'A woman in a dark green rain jacket with a deep hood, short grey hair. Calm, tired face.'
const OWNER = 'a macro close up shot of @ana with rain slowly dripping down her hood'
const ana = mkPiece('ana', 'Ana', 'person', { state: 'approved', onBoard: true, looks: ['/lab-assets/cast/ana/kept/face-1.png'], line: CARD, cardId: 'ana' })
const bible = (prompt: string): BibleRecord => ({ worldId: 'loc-x', version: 3, prompt, master: null, candidates: [], lighting: 'Flat grey light.', materials: '',
  extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', elements: [{ tag: 'ana', kind: 'cast', cardId: 'ana', refs: [], line: CARD }] } as BibleRecord)
const hero = { tag: 'hero', cx: 0.5, top: 0.05, bottom: 1.2, x0: 0.2, x1: 0.8 }
const draw = (b: BibleRecord, o: Partial<StillPromptParts> = {}): StillPromptParts => ({ bible: b, plan: { sentence: '', kit: [] }, cast: { cardId: 'ana', name: 'Ana', description: CARD },
  view: { kinds: [], camera: '', angle: 'Seen at eye height.', pieces: [] }, figures: [hero], action: 'standing', perfT: 0, focal: 100, ...o })
const kit = { plan: { sentence: 'a bus stop', kit: [] }, perf: { path: [[0, 0]], castId: 'ana', extras: [] }, description: 'd' } as unknown as KitWorld
const take = { id: 't', worldId: 'loc-x', packId: null, fps: 24, frames: 97, action: '' } as TakeRecord
const render = (b: BibleRecord) => stagedDefault({ take, kit, bible: b, hero: { cardId: 'ana', name: 'Ana', description: CARD }, descriptions: { ana: CARD }, camera: 'A close-up' })

describe('words to prompts: a drawer edit reaches the draw and the render', () => {
  const sheet = bible(biblePrompt(OWNER, [ana])) // what the sheet sync writes for the drawer's text
  it('the sheet keeps the person as a tag; the draw and the render both say the framing and the weather, the person by her words', () => {
    expect(sheet.prompt).toBe(OWNER)
    const d = buildDrawPrompt(draw(sheet)), r = render(sheet)
    for (const p of [d, r]) {
      expect(p).toContain('macro close up shot of a woman in a dark green rain jacket')
      expect(p).toContain('rain slowly dripping down her hood')
      expect(p).not.toContain('@')
    }
  })
  it('a still drawn from the words before the edit reads as behind, naming the scene prompt', () => {
    const before = bible(biblePrompt('@ana waits at a bus stop', [ana]))
    const still = { bibleVersion: before.version, bibleKeys: stillBibleKeys(before) }
    expect(stillBibleWhy(still, before)).toBeNull()
    expect(stillBibleWhy(still, { ...sheet, version: before.version + 1 })).toBe('The scene prompt changed after this still was drawn')
  })
})

describe('style across every prompt: one stated medium', () => {
  const words = 'an oil painting of @ana by a cold stove'
  const painted = bible(biblePrompt(words, [ana]))
  it('the concept tile, the person look, the draw, the finish card and the render all drop the photograph words', () => {
    expect(conceptPrompt('location', { description: 'an oil painting of a small kitchen' })).not.toMatch(/photograph|photographic/i)
    expect(frontPrompt('An oil painting of a woman in a dark green rain jacket with a deep hood.')).not.toMatch(/reference photo\b/)
    const parts = draw(painted)
    expect(buildDrawPrompt(parts)).not.toMatch(/^Photo|A photograph/)
    expect(drawStyled(parts)).toBe(true) // the kit press passes this to the finish card (kitRun.ts)
    expect(buildCardPrompt({ gear: true, master: false, materials: [], styled: drawStyled(parts) })).not.toMatch(/photograph|photographic/i)
    expect(render(painted)).not.toMatch(/Photoreal/)
  })
  it('the draw\'s negative loses its photo-look items for the styled prompt, and keeps them for the plain one', () => {
    const neg = (prompt: string) => (buildQwenDepthGraph({ prompt, seeds: [1], prefix: 'p' }) as Record<string, { inputs: { text?: string } }>).neg.inputs.text
    expect(neg(buildDrawPrompt(draw(painted)))).toBe(qwenNegative({ styled: true }))
    expect(neg(buildDrawPrompt(draw(bible(OWNER))))).toBe(qwenNegative())
    expect(qwenNegative({ styled: true })).not.toBe(qwenNegative())
  })
  it('unstated: nothing is added, neither a photograph lead nor a Photoreal closer', () => {
    expect(buildDrawPrompt(draw(bible(OWNER)))).not.toMatch(/^A photograph\./)
    expect(render(bible(OWNER))).not.toMatch(/Photoreal/)
  })
})

describe('the look frame: the client\'s press body and the server\'s parser', () => {
  // the Stage's still press sends `...(sameLook ? { sameLook: true } : {})` (useHeroStill.ts, useStillPreview.ts)
  const body = (on: boolean) => ({ ...(on ? { sameLook: true } : {}) })
  it('off (the default) sends nothing and the server reads no look; on, the server reads it', () => {
    expect(parseKitFields(body(false))).not.toHaveProperty('sameLook')
    expect(parseKitFields(body(true))).toMatchObject({ sameLook: true })
  })
})

describe('saved data the new code writes, read by the rules the old code reads by', () => {
  it('a new scene\'s design screen is one the old code opens', () => {
    for (const d of [seededDesign(), seededDesign({ text: 'a cook in a kitchen' }), seededDesign({ text: 'a cook in a kitchen', asIs: true })]) expect(['guided', 'board']).toContain(d.screen)
  })
  it('an extra the new code adds carries a costume the old parser accepts; an old hero costume still loads', () => {
    const extras = [{ path: [[1, 1], [1, 5]], gait: 'walk', delay: 0, costume: EXTRA_COSTUME, variant: 0 }]
    expect(['soldier', 'plain', 'modern']).toContain(EXTRA_COSTUME)
    expect(parsePerformancePlan({ ...WALK_TOWARD, castId: 'ana', extras }).ok).toBe(true)
    expect(parsePerformancePlan({ ...WALK_TOWARD, costume: 'soldier' }).ok).toBe(true)
  })
  it('a person\'s Cast card is saved with its face as references[1], the image the draw and the render read as the face', async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = []
    const f = async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      sent.push({ url, body })
      return new Response(JSON.stringify(url.endsWith('/cast/keep') ? { url: '/lab-assets/cast/ana/kept/face-1.png' } : { id: 'p', ingredients: {} }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    await briefApi(f as typeof fetch, 'sc-x').saveCard({ cardId: 'ana', name: 'Ana', description: CARD, face: '/lab-assets/cast/ana/draft/cand-2.png' })
    const version = sent.find((s) => s.url.endsWith('/ingredient'))!.body as { kind: string; id: string; payload: { name: string; references: string[]; sheets: string[] } }
    expect(version).toMatchObject({ kind: 'cast', id: 'ana', payload: { name: 'Ana', description: CARD, sheets: [] } })
    expect(version.payload.references[1]).toBe('/lab-assets/cast/ana/kept/face-1.png') // castFace: references[1], else sheets[4]
  })
})
