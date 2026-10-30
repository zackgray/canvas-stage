// The Stage fixes from the 10/27 end-to-end runs (pure parts): the performer's own cast card (never another scene's, never the
// library's first on a fresh scene), the
// performer's pronoun from the cast card's words, and where the set lies (framing, the Find list, "Bring near").
import { describe, expect, it } from 'vitest'
import type { BibleElement, BibleRecord } from '../../../shared/bibleContract'
import type { KitItem } from '../../../stage3d/contract'
import { heroWords, performerWords, pronounOf } from '../pronoun'
import { performerCard } from '../railModel'
import { FAR_M, findList, nearMark, setBounds } from '../setBounds'

const cards = [{ id: 'sloane' }, { id: 'soldier' }]
const el = (tag: string, cardId?: string): BibleElement => ({ tag, kind: 'cast', cardId, refs: [], line: '' })

describe('performerCard', () => {
  it('the card the world names wins', () => expect(performerCard(cards, 'soldier', [])?.id).toBe('soldier'))
  it("no castId yet: the scene's own cast element picks the card, not the project's first (Sloane)", () => {
    expect(performerCard(cards, undefined, [el('soldier', 'soldier')])?.id).toBe('soldier')
    expect(performerCard(cards, null, [el('a', 'gone'), el('b', 'soldier')])?.id).toBe('soldier')
  })
  it("the scene has cast but none of its cards is in the project, or the Bible is still loading: nobody, not another scene's card", () => {
    expect(performerCard(cards, undefined, [el('a', 'gone')])).toBeNull()
    expect(performerCard(cards, undefined, undefined)).toBeNull()
  })
  it("a scene with no cast element names nobody: a fresh scene starts with NO card chosen (stale-cast-card, owner 2026-10-28) — the shared library's first card is never picked up", () => {
    expect(performerCard(cards, undefined, null)).toBeNull()
    expect(performerCard(cards, undefined, [])).toBeNull()
  })
})

describe("the performer's pronoun", () => {
  it('reads she / he from the card words, and says they when unclear or mixed', () => {
    expect(pronounOf('a woman in her thirties, dark smock')).toBe('she')
    expect(pronounOf('man in his fifties, flat cap')).toBe('he')
    expect(pronounOf('a beekeeper in a straw hat')).toBe('they')
    expect(pronounOf('a man and a woman')).toBe('they')
    expect(pronounOf(undefined)).toBe('they')
  })
  it("heroWords gathers the hero element's line and the brief's look", () => {
    const bible = { elements: [{ ...el('op', 'c1'), line: 'a man in a coat' }], brief: { elements: [{ tag: 'op', name: 'Operator', look: 'weathered' }] } } as unknown as BibleRecord
    expect(heroWords(bible, 'c1')).toBe('a man in a coat Operator weathered')
    expect(heroWords(null, 'c1')).toBe('')
  })
  it('the lines agree with the pronoun', () => {
    expect(performerWords('he').stands).toBe('Where he stands')
    expect(performerWords('she').dragHint).toBe('Drag her in the view to move her.')
    expect(performerWords('they')).toMatchObject({ stands: 'Where they stand', does: 'What they do', clear: 'Clear their action', walks: 'They walk' })
  })
})

describe('where the set lies', () => {
  const kit: KitItem[] = [{ kind: 'crates', at: [3, -9], label: 'locomotive' }, { kind: 'mound', at: [-2, -40] }]
  it('the spread covers the mark and the far piece', () => {
    const b = setBounds(kit, [0.6, -12.5])
    expect(b.radius).toBeGreaterThan(15)
    expect(b.cz).toBeLessThan(-20)
  })
  it('the Find list names each piece with its distance, and calls a far one far', () => {
    const rows = findList(kit, [0.6, -12.5])
    expect(rows.map((r) => r.name)).toEqual(['locomotive', 'mound'])
    expect(rows[0].far).toBe(false)
    expect(rows[1].metres).toBeGreaterThan(FAR_M)
    expect(rows[1].far).toBe(true)
  })
  it('Bring near lands 2.5 m ahead of the mark along its facing', () => {
    expect(nearMark({ at: [1, -10], yawDeg: 0 })).toEqual([1, -7.5])
    expect(nearMark({ at: [0, 0], yawDeg: 90 })).toEqual([2.5, 0])
  })
})
