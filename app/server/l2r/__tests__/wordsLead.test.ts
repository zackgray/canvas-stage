// Stage-only plan, section 5: the scene words (the drawer's text, the Bible's prompt) lead the render; nothing the user or a card
// wrote is cut or scrubbed; a stated medium drops "Photoreal."; an unstaged cast member is still left out (E137/E138). Pure: no
// files, nothing paid.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../../src/shared/briefContract.ts'
import type { TakeRecord } from '../../../src/shared/shotContract.ts'
import type { KitWorld } from '../../stage3d/types.ts'
import { stagedDefault } from '../stagedDefault.ts'

const ANA = 'A cook in a yellow raincoat with the hood up, a lamp in one hand. She hums as she walks.'
const FIRST = 'a cook in a yellow raincoat with the hood up, a lamp in one hand'
const BEN = 'A tall man in a grey apron.'
const bible = (prompt: string, o: Partial<BibleRecord> = {}): BibleRecord => ({ worldId: 'w', version: 1, prompt, master: null, candidates: [], lighting: 'Dusk: a low sun',
  materials: '', extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', ...o,
  elements: [{ tag: 'ana', kind: 'cast', cardId: 'c-ana', refs: [], line: '' }, { tag: 'ben', kind: 'cast', cardId: 'c-ben', refs: [], line: '' },
    { tag: 'kettle', kind: 'prop', refs: [], line: 'a dented copper kettle' }] })
const kit = { plan: { sentence: 'a small yard at dusk', kit: [] }, perf: { path: [[0, 0]], castId: 'c-ana', extras: [] }, description: 'a yard' } as unknown as KitWorld
const take = (action = '') => ({ id: 't', worldId: 'w', packId: null, fps: 24, frames: 97, action } as TakeRecord)
const brief = (o: Partial<SceneBriefV2> = {}): SceneBriefV2 => ({ logline: '', place: { setting: 'a small yard', period: '', season: '', time: '', weather: '' },
  light: { key: 'a low sun', direction: '', height: '', quality: '', colour: '', others: '', effect: '' }, atmosphere: [], beats: [{ who: '@ana', does: 'walks to the gate', seconds: 2, visible: '' }],
  elements: [{ name: 'Ana', tag: 'ana', type: 'person', look: '', supported: true, materials: '', condition: '', face: '' }],
  camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '', background: '', exclude: [], warnings: [], developed: [], ...o })
const render = (b: BibleRecord, action = '', camera = '') =>
  stagedDefault({ take: take(action), kit, bible: b, hero: { cardId: 'c-ana', name: 'Ana', description: ANA }, descriptions: { 'c-ana': ANA, 'c-ben': BEN }, camera })

describe('the scene words lead the render', () => {
  it('the owner\'s case: the framing and the weather detail both reach the prompt, with Ana\'s whole first card sentence', () => {
    const p = render({ ...bible('a macro close up shot of @ana with rain slowly dripping down her hood'), brief: brief() }, '', 'A close-up, the camera holds still')
    expect(p).toContain('macro close up shot of')
    expect(p).toContain('with rain slowly dripping down her hood')
    expect(p).toContain(FIRST)
    // the tag is replaced by the card; its second sentence follows the user's sentence; no camera clause, no Match, no Keep, no closer
    expect(p).toBe(`A macro close up shot of ${FIRST} with rain slowly dripping down her hood. She hums as she walks.`)
  })
  it('"a firefighter by a campfire, grainy" survives whole', () => {
    expect(render(bible('a firefighter by a campfire, grainy. @ana watches.'))).toMatch(/^A firefighter by a campfire, grainy\. /)
  })
  it('nothing closes the prompt (no "Photoreal."); the brief\'s style closes it when set', () => {
    expect(render(bible('an oil painting of @ana by the stove'))).not.toMatch(/Photoreal/)
    expect(render({ ...bible('an oil painting of @ana by the stove'), brief: brief({ style: 'soft ink tones' }) })).toMatch(/ She hums as she walks\. Soft ink tones\.$/)
    expect(render(bible('@ana by the stove'))).not.toMatch(/Photoreal|as the driver/)
  })
  it('the user\'s own "no other people" clause survives with a person staged', () => {
    expect(render(bible('@ana alone on a quiet street, no other people.'))).toContain('alone on a quiet street, no other people.')
  })
  it('a cast member not on the set is still left out (E137/E138); the staged one is said', () => {
    const p = render(bible('@ben sits by the window. @ana pours tea from @kettle.'))
    expect(p).not.toMatch(/sits by the window|grey apron|\bben\b/i)
    expect(p).toMatch(/^A cook in a yellow raincoat with the hood up, a lamp in one hand pours tea from a dented copper kettle\. /)
    expect(p).not.toMatch(/as the driver/)
  })
  it('a tagged piece is said once, by its line, with no keep line after it', () => {
    const p = stagedDefault({ take: take(), kit, bible: bible('@ana pours tea from @kettle.'), hero: { cardId: 'c-ana', name: 'Ana', description: ANA },
      descriptions: { 'c-ana': ANA } })
    expect(p.match(/dented copper kettle/g)).toHaveLength(1)
    expect(p).not.toMatch(/Keep the same/)
  })
  it('a staged person the words do not name follows them, by their card, doing the take\'s action', () => {
    expect(render(bible('A quiet street at night, rain on the cobbles.'), 'the performer walks to the door'))
      .toBe(`A quiet street at night, rain on the cobbles. ${FIRST[0].toUpperCase()}${FIRST.slice(1)} walks to the door.`)
  })
  it('the words name the hero: the take\'s action follows by her name', () => {
    expect(render(bible('@ana in a small kitchen.'), 'the performer lifts the kettle')).toMatch(/kitchen\. She hums as she walks\. Ana lifts the kettle\.$/)
  })
  it('no words: the brief\'s structured shape, the person by her card (never a clause cut at a comma)', () => {
    expect(render({ ...bible(''), brief: brief() })).toBe(`${FIRST[0].toUpperCase()}${FIRST.slice(1)} walks to the gate, in a small yard. A low sun.`)
  })
})
