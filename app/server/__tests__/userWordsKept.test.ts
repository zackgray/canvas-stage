// Stage-only review fix pass (2026-10-29): the user's words reach the draw and the render whole. F1: a pasted prompt that opens a
// sentence with "Set in …", "Cast:", "Lighting:" … keeps those words in both prompts (the Guided stepper's label stripper no longer
// runs over the drawer's text). Same fixture shape as joinSeams.test.ts, neutral nouns. Pure: no files, nothing paid.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import type { KitWorld } from '../stage3d/types.ts'
import { buildDrawPrompt, type StillPromptParts } from '../hero/kitStillPrompt.ts'
import { stagedDefault } from '../l2r/stagedDefault.ts'

const CARD = 'A woman in a dark green rain jacket with a deep hood, short grey hair. Calm, tired face.'
const bible = (prompt: string): BibleRecord => ({ worldId: 'loc-x', version: 3, prompt, master: null, candidates: [], lighting: 'Flat grey light.', materials: '',
  extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', elements: [{ tag: 'ana', kind: 'cast', cardId: 'ana', refs: [], line: CARD }] } as BibleRecord)
const hero = { tag: 'hero', cx: 0.5, top: 0.05, bottom: 1.2, x0: 0.2, x1: 0.8 }
const draw = (b: BibleRecord): StillPromptParts => ({ bible: b, plan: { sentence: '', kit: [] }, cast: { cardId: 'ana', name: 'Ana', description: CARD },
  view: { kinds: [], camera: '', angle: 'Seen at eye height.', pieces: [] }, figures: [hero], action: 'standing', perfT: 0, focal: 100 })
const kit = { plan: { sentence: 'a bus stop', kit: [] }, perf: { path: [[0, 0]], castId: 'ana', extras: [] }, description: 'd' } as unknown as KitWorld
const take = { id: 't', worldId: 'loc-x', packId: null, fps: 24, frames: 97, action: '' } as TakeRecord
const render = (b: BibleRecord) => stagedDefault({ take, kit, bible: b, hero: { cardId: 'ana', name: 'Ana', description: CARD }, descriptions: { ana: CARD }, camera: 'A close-up' })

describe('F1: label-shaped openers in the user\'s words are kept in the draw and the render', () => {
  const words = 'Set in motion by the storm, @ana runs. Cast: a long shadow on the wall. Lighting: one bare bulb. Background: a brick lane.'
  const prompts = () => [['draw', buildDrawPrompt(draw(bible(words)))], ['render', render(bible(words))]] as const
  it('every word stays, the person said by her words', () => {
    for (const [, p] of prompts()) {
      expect(p).toContain('et in motion by the storm, a woman in a dark green rain jacket') // the render lower-cases its lead after the camera
      expect(p).toContain('Cast: a long shadow on the wall.')
      expect(p).toContain('Lighting: one bare bulb.')
      expect(p).toContain('Background: a brick lane.')
    }
  })
  it('F6: a cast member nobody plays goes without a stray ";." and the verb is said of the one who stays', () => {
    const b = bible('@ana and @bo argue by the @stove; @bo storms out.')
    b.elements.push({ tag: 'bo', kind: 'cast', cardId: 'bo', refs: [], line: '' } as never, { tag: 'stove', kind: 'prop', refs: [], line: '' } as never)
    for (const p of [buildDrawPrompt(draw(b)), render(b)]) {
      expect(p).toMatch(/argues by the stove\./)
      expect(p).not.toMatch(/;\s*\.|\bargue\b|storms/)
    }
  })
  it('F7: an empty drawer, a brief beat with a tagged prop: the draw says it with its article, like the render', () => {
    const brief = { logline: '', place: { setting: 'a small kitchen', period: '', season: '', time: '', weather: '' },
      light: { key: 'a window', direction: '', height: '', quality: '', colour: '', others: '', effect: '' }, atmosphere: [],
      elements: [{ name: 'Ana', tag: 'ana', type: 'person', look: CARD }, { name: 'Iron stove', tag: 'stove', type: 'prop' }],
      beats: [{ who: '@ana', does: 'lifts the kettle off @stove', seconds: 4, visible: '' }], camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '' }
    const b = { ...bible(''), brief } as unknown as BibleRecord
    b.elements.push({ tag: 'stove', kind: 'prop', refs: [], line: '' } as never)
    const d = buildDrawPrompt(draw(b))
    expect(d).toContain('lifts the kettle off the iron stove')
    expect(d).not.toMatch(/off stove/)
    expect(render(b)).toContain('lifts the kettle off the iron stove')
  })
  it('"Set in" is not cut from the start of the words', () => {
    const [[, d], [, r]] = prompts()
    expect(d).toMatch(/Set in motion by the storm/)
    expect(r).toMatch(/set in motion by the storm/i)
  })
})
