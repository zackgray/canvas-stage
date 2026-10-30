// Master fix (run 4, 2026-10-25): the approved master drew an invented beekeeper left of the hive because its prompt began with the
// brief's setting, which was the owner's whole first sentence ("Photo of an older beekeeper in a white suit checks a hive at …").
// The master is the place: its person and action are taken out (cast tags, card role nouns, generic person nouns), it says nobody
// is in it, and its negative names people. The still keeps its person from the cast card. Pure; nothing paid.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../../src/shared/briefContract.ts'
import { warnPrompt } from '../../prompt/warn.ts'
import { buildDrawPrompt, NOBODY, type StillPromptParts } from '../kitStillPrompt.ts'
import { personWords, placeOnly } from '../placeWords.ts'
import { buildQwenDepthGraph, QWEN_NEG, QWEN_NEG_PEOPLE } from '../qwenGraph.ts'

const FIRST = 'An older beekeeper in a white suit checks a hive at the edge of an orchard on a warm evening, low sun through the trees.'
const SCENE = `${FIRST} @dolly is in the scene. Warm golden back light. dolly walks up to the hive, lifts out a frame and holds it up to the light.`
const CARD = 'an older woman beekeeper in a white suit, with a hat and net resting on the brim, gloves, and a worn leather satchel.'
const BRIEF = { logline: SCENE, place: { setting: FIRST, period: '', season: '', time: '', weather: '' },
  light: { key: 'Warm golden back light', direction: '', height: '', quality: '', colour: '', others: '', effect: '' }, atmosphere: [],
  elements: [{ name: 'Dolly', tag: 'dolly', type: 'person', look: CARD, supported: true, materials: '', condition: '', face: '' }],
  beats: [{ who: '@dolly', does: 'dolly walks up to the hive, lifts out a frame and holds it up to the light', seconds: 2, visible: '' }],
  camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '', background: '', exclude: [], warnings: [], developed: [] } as unknown as SceneBriefV2
const BIBLE = { worldId: 'loc-x', version: 4, prompt: SCENE, master: null, candidates: [], lighting: 'Warm golden back light', materials: '',
  extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', brief: BRIEF,
  elements: [{ tag: 'dolly', kind: 'cast', cardId: 'd', refs: [], line: CARD }] } as unknown as BibleRecord
const parts = (o: Partial<StillPromptParts> = {}): StillPromptParts => ({ bible: BIBLE, plan: { sentence: SCENE, kit: [] },
  cast: { cardId: 'd', name: 'Dolly', description: 'An older woman beekeeper in a white suit' }, view: { kinds: ['tree'], camera: '', pieces: [{ kind: 'tree' }] }, focal: 24, ...o })

describe('the master is the place, with nobody in it', () => {
  it('the owner\'s orchard master names no beekeeper, no action, and says nobody is there', () => {
    const p = buildDrawPrompt(parts({ mode: 'master', masterCamera: 'Seen at eye height, 1.6 metres up.' }))
    expect(p).toMatch(/^Photo taken at the edge of an orchard on a warm evening, low sun through the trees\. The place stands empty and quiet\. Seen at eye height/)
    expect(p).not.toMatch(/beekeeper|white suit|checks|hive|dolly|woman/i)
    expect(p).toContain(NOBODY)
    // said as what is there: the app's own negation warning stays quiet on the app's own master prompt
    expect(warnPrompt(p, { step: 'master', brief: BRIEF }).map((w) => w.code)).not.toContain('negation')
  })
  it('the hero still keeps its person from the cast card, and its place no longer says a second person', () => {
    const p = buildDrawPrompt(parts({ figures: [{ tag: 'hero', cx: 0.5, top: 0.3, bottom: 0.8, x0: 0.45, x1: 0.55 }], action: 'walking towards us' }))
    // stage-only: the scene words lead as written (so the owner's own person sentence stays: nothing they wrote is cut); the tag is
    // replaced by the card; the master above still takes the person out
    expect(p).toMatch(/^An older beekeeper in a white suit checks a hive at the edge of an orchard on a warm evening/)
    expect(p).toContain('An older woman beekeeper in a white suit is in the scene.')
    expect(p).not.toContain('Dolly:')
    expect(p).not.toContain(NOBODY)
  })
  it('the master\'s negative names people; a still\'s does not', () => {
    const neg = (noPeople?: boolean) => (buildQwenDepthGraph({ prompt: 'p', seeds: [1], prefix: 'x', noPeople }).neg.inputs as { text: string }).text
    expect(neg(true)).toBe(`${QWEN_NEG}${QWEN_NEG_PEOPLE}`)
    expect(neg()).toBe(QWEN_NEG)
  })
})

describe('placeOnly', () => {
  const words = personWords(BIBLE)
  it('takes person words from the cast (tag, card role nouns) and generic nouns, never a place noun', () => {
    expect(words).toEqual(expect.arrayContaining(['dolly', 'beekeeper', 'woman', 'man', 'people']))
    expect(words).not.toEqual(expect.arrayContaining(['orchard', 'suit', 'older']))
  })
  it('keeps the place a person sentence puts them in; drops a sentence that is all person; leaves a place sentence alone', () => {
    expect(placeOnly(FIRST, words)).toBe('at the edge of an orchard on a warm evening, low sun through the trees')
    expect(placeOnly('@dolly is in the scene. dolly walks up to the hive.', words)).toBe('')
    expect(placeOnly('At dusk, a man walks along the river bank, watching him.', words)).toBe('At dusk, along the river bank')
    expect(placeOnly('A muddy field at dusk', words)).toBe('A muddy field at dusk')
    expect(placeOnly('An old apple orchard, autumn, late afternoon, clear', words)).toBe('An old apple orchard, autumn, late afternoon, clear')
  })
})
