// Consistency pass (qa-2026-10-27-coverage FABLE-REVIEW §1): the beekeeper card's first sentence read as two people ("a woman in her
// fifties, with a working beekeeper") and the first beat named "A beekeeper" again as its own sentence; the close-up drew two women.
// The role is the same person, the beat opens with her pronoun, and one figure gets the alone line. The exact strings of that scene.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import { warnPrompt } from '../../prompt/warn.ts'
import { buildDrawPrompt, type StillPromptParts } from '../kitStillPrompt.ts'
import { aloneLine, isRole, onePerson, personNouns, pronounOf, samePerson } from '../onePerson.ts'

const TINA = 'A woman in her fifties, a working beekeeper. Weathered, kind face, grey hair tied back under a wide-brimmed straw hat with a pale mesh veil pushed up off her face. White cotton beekeeping coverall, a little worn and dusty at the knees, sleeves cuffed over thick tan leather gloves, sturdy brown boots. Calm, focused expression. Standing relaxed, full body in view.'
const BEAT1 = 'A beekeeper tends her hives at the end of a long afternoon'
const ALONE = 'She is alone in the picture, the only person in it.'
const hero = { tag: 'hero', cx: 0.5, top: 0.25, bottom: 1.01, x0: 0.4, x1: 0.6 }

// (stage-only) the card rewrite (wornOn) is gone: the card goes as written; the role reader stays for samePerson
describe('a role after the subject is the same person', () => {
  it('roles and garments told apart', () => {
    expect(['a working beekeeper', 'an old sailor', 'a farmer', 'a nurse', 'a young fisherwoman'].map(isRole)).toEqual([true, true, true, true, true])
    expect(['a mesh net folded back', 'a wide-brimmed straw hat', 'a pale mesh veil', 'a leather holster', 'a flower in her hair', 'a long dress'].map(isRole)).toEqual([false, false, false, false, false, false])
  })
})

describe('a story line naming the card\'s person is said by her pronoun', () => {
  it('the beekeeper beat opens with She; a pronoun-led or other-subject line is untouched', () => {
    expect(personNouns(TINA)).toEqual(['woman', 'beekeeper'])
    expect(samePerson(BEAT1, TINA)).toBe('She tends her hives at the end of a long afternoon')
    expect(samePerson('The old beekeeper lifts a frame', TINA)).toBe('She lifts a frame')
    expect(samePerson('She opens a hive', TINA)).toBe('She opens a hive')
    expect(samePerson('The frame is full, and the bees are calm', TINA)).toBe('The frame is full, and the bees are calm')
    expect(samePerson('A dog runs past', TINA)).toBe('A dog runs past')
  })
  it('a card with no he or she keeps the noun, made definite', () => {
    expect(pronounOf('A tall beekeeper, a veil')).toBe('They')
    expect(samePerson('A beekeeper tends the hives', 'A tall beekeeper, a veil')).toBe('The beekeeper tends the hives')
    expect(aloneLine('A tall beekeeper')).toBe('They are alone in the picture, the only person in it.')
  })
  it('one person: the hero alone, or one extra; a creature is not a person; unknown is not one', () => {
    expect(onePerson([hero])).toBe(true)
    expect(onePerson([hero, { ...hero, tag: 'creature:dog' }])).toBe(true)
    expect(onePerson([hero, { ...hero, tag: 'extra:1' }])).toBe(false)
    expect(onePerson(null)).toBe(false)
  })
})

describe('the beekeeper still prompt', () => {
  const bible = { worldId: 'w', version: 1, prompt: '', master: null, candidates: [], lighting: '', materials: '', extrasSheet: null, grade: null, createdAt: '', updatedAt: '',
    elements: [{ tag: 'tina', kind: 'cast', cardId: 'tina', refs: [], line: '' }],
    brief: { place: { setting: 'an old apple orchard', period: '', season: 'late summer', time: 'late afternoon', weather: 'clear' }, light: { key: 'a low sun' },
      elements: [{ name: 'Tina', tag: 'tina', type: 'person', look: TINA }], beats: [{ who: '@tina', does: BEAT1, seconds: 2, visible: '' }, { who: '@tina', does: 'She opens a hive', seconds: 2, visible: '' }], atmosphere: [], style: '' },
  } as unknown as BibleRecord
  const parts = (o: Partial<StillPromptParts> = {}): StillPromptParts => ({ bible, plan: { sentence: '', kit: [] }, cast: { cardId: 'tina', name: 'Tina', description: TINA },
    view: null, figures: [hero], perfT: 0, focal: 35, ...o })

  it('says the card as written and the beat by pronoun, with no alone line', () => {
    const t = buildDrawPrompt(parts())
    // stage-only: the card is no longer rewritten (no "with", no role swap) and no loose-cloth line follows it
    expect(t).toMatch(/^A woman in her fifties, a working beekeeper\. Weathered, kind face/)
    expect(t).toContain('She tends her hives at the end of a long afternoon.')
    expect(t).not.toMatch(/with a working beekeeper|A beekeeper tends|loose cloth/)
    expect(t).not.toContain(ALONE)
    expect(warnPrompt(t, { step: 'still' }).map((w) => w.code)).not.toContain('negation')
  })
  it('no alone line with two people either, or when the figures are not known', () => {
    expect(buildDrawPrompt(parts({ figures: [hero, { ...hero, tag: 'extra:1', cx: 0.2 }] }))).not.toContain(ALONE)
    expect(buildDrawPrompt(parts({ figures: null }))).not.toContain(ALONE)
  })
})
