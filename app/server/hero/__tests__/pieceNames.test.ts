// Debris fix (2026-10-25): the owner's orchard master was drawn from "In the frame: tree; a white wooden beehive box …; debris. The
// tops of tree run out of the picture at the top edge." The planner had scattered a "debris" pile the owner never wrote, the prompt
// named it, and the image model drew junk into the picture. Set dressing is now named only from the owner's words, and the cut
// line is good English. Pure; nothing paid.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import { KIT_PIECES } from '../../../src/stage3d/kit.ts'
import { buildDrawPrompt, type StillPromptParts } from '../kitStillPrompt.ts'
import { FILLER_KINDS, LANDMARK_KINDS, RELIEF_KINDS } from '../kitWords.ts'
import { cutSentence, isPluralPhrase, ownerNames, pluralNoun } from '../pieceNames.ts'

const SCENE = 'An older beekeeper in a white suit checks a hive at the edge of an orchard on a warm evening, low sun through the trees. ' +
  '@dolly is in the scene. Warm golden back light. dolly walks up to the hive, lifts out a frame and holds it up to the light.'
const BIBLE = { worldId: 'loc-x', version: 4, prompt: SCENE, master: null, candidates: [], lighting: 'Warm golden back light.', materials: '',
  extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', elements: [
    { tag: 'dolly', kind: 'cast', cardId: 'd', refs: [], line: '' },
    { tag: 'beehive', kind: 'prop', refs: [], line: 'A white wooden beehive box with stacked white boxes.' }] } as unknown as BibleRecord
const tree = { kind: 'tree' }, tree2 = { kind: 'tree' }, hive = { kind: 'beehive', pieceTag: 'prop:beehive' }, debris = { kind: 'debris' }
const VIEW = { kinds: ['tree', 'beehive', 'debris'], camera: '', pieces: [tree, hive, debris, tree2], cutTop: [tree, tree2] }
const master = (o: Partial<StillPromptParts> = {}): string => buildDrawPrompt({ bible: BIBLE, plan: { sentence: SCENE, kit: [] },
  cast: { name: '', description: '' }, view: VIEW, mode: 'master', masterCamera: 'Seen at eye height, 1.6 metres up.', focal: 24, ...o })

describe('the owner\'s orchard master', () => {
  it('never names the debris the planner added on its own, and says the cut trees in good English', () => {
    const p = master()
    expect(p).not.toMatch(/debris/i)
    expect(p).toContain('In the frame: trees; a white wooden beehive box with stacked white boxes.')
    expect(p).toContain('The tops of the trees run out of the picture at the top edge.')
    expect(p).not.toMatch(/tops of tree\b/)
  })
  it('one tree cut is "the top of the tree runs out"', () => {
    const p = master({ view: { ...VIEW, pieces: [tree, hive, debris], cutTop: [tree] } })
    expect(p).toContain('In the frame: tree; a white wooden beehive box')
    expect(p).toContain('The top of the tree runs out of the picture at the top edge.')
  })
  it('debris the owner wrote, labelled, or put on the board is named; relief never', () => {
    const asked = 'A battlefield strewn with debris after the fight.'
    expect(master({ plan: { sentence: asked, kit: [] }, bible: { ...BIBLE, prompt: asked } })).toMatch(/In the frame: [^.]*debris/)
    expect(master({ view: { ...VIEW, pieces: [{ kind: 'debris', label: 'a heap of broken planks' }] } })).toMatch(/In the frame: a heap of broken planks\./)
    expect(master({ view: { ...VIEW, pieces: [{ kind: 'rock', label: 'a big rock' }, tree] } })).toMatch(/In the frame: tree\./)
  })
})

describe('naming words', () => {
  it('each KIT kind is placed: relief, set dressing or a landmark (a new kit kind must be decided)', () => {
    for (const kind of Object.keys(KIT_PIECES)) {
      const homes = [RELIEF_KINDS.has(kind), FILLER_KINDS.has(kind), LANDMARK_KINDS.has(kind)].filter(Boolean).length
      expect([kind, homes]).toEqual([kind, 1])
    }
  })
  it('the owner\'s words answer to a kind by its noun, singular or plural', () => {
    expect(ownerNames('crates', 'a crate by the door')).toBe(true)
    expect(ownerNames('weaponRack', 'a weapon rack')).toBe(true)
    expect(ownerNames('debris', 'an orchard on a warm evening')).toBe(false)
    expect(ownerNames('spear', 'a spearmint bush')).toBe(false)
  })
  it('plurals and the cut sentence for one, several, mass and brief-written names', () => {
    expect([pluralNoun('tree'), pluralNoun('box'), pluralNoun('debris'), pluralNoun('barrels'), pluralNoun('dead tree')]).toEqual(['trees', 'boxes', 'debris', 'barrels', 'dead trees'])
    expect([isPluralPhrase('apple trees heavy with fruit'), isPluralPhrase('a box with stacked boxes'), isPluralPhrase('debris'), isPluralPhrase('moss')]).toEqual([true, false, false, false])
    expect(cutSentence([])).toBe('')
    expect(cutSentence(['tree'])).toBe('The top of the tree runs out of the picture at the top edge.')
    expect(cutSentence(['dead tree', 'a tall hut'])).toBe('The top of the dead tree and the top of a tall hut run out of the picture at the top edge.')
    expect(cutSentence(['apple trees heavy with fruit'])).toBe('The tops of apple trees heavy with fruit run out of the picture at the top edge.')
  })
})
