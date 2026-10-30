// The option rail's model (layout wave L2; L5 no Discard): the per-kind card lists, pure — the current card is checked, the
// others carry the swap press.
import { describe, expect, it, vi } from 'vitest'
import { castLookCards, kitSwapCards, performerCard, pickHasViewer, propTileCards } from '../railModel'
import type { Ingredient } from '../../../project/model'
import type { KitItem } from '../../../stage3d/contract'

const item = (over: Partial<KitItem> = {}): KitItem => ({ kind: 'oak', at: [0, 0], ...over })

describe('kit swap cards', () => {
  it('lists every kit kind with the piece’s own kind checked; the others carry the swap press', () => {
    const swap = vi.fn(async () => {})
    const cards = kitSwapCards(item({ kind: 'rock' }), swap)
    expect(cards.length).toBeGreaterThan(3)
    const cur = cards.find((c) => c.current)!
    expect(cur.id).toBe('rock')
    expect(cur.apply).toBeUndefined() // the current one only carries the check
    const hut = cards.find((c) => c.id === 'hut')!
    expect(hut.img).toBeNull() // no pictures: no peek, no viewer
    void hut.apply?.()
    expect(swap).toHaveBeenCalledWith('hut')
  })
})

describe('cast look cards', () => {
  const card: Ingredient<{ name: string; description: string; references: string[]; sheets: string[] }> = {
    id: 'beekeeper-x', name: 'Beekeeper',
    versions: [
      { version: 1, created: 't1', payload: { name: 'Beekeeper', description: 'straw hat, smock', references: ['/k/face-1.png'], sheets: [] } },
      { version: 2, created: 't2', payload: { name: 'Beekeeper', description: 'canvas trousers', references: ['/k/face-2.png'], sheets: [] } },
    ],
  }

  it('one card per version, the last one current; using an older look keeps its face and words', () => {
    const useLook = vi.fn(async () => {})
    const cards = castLookCards(card, useLook)
    expect(cards.map((c) => [c.id, c.current])).toEqual([['v1', false], ['v2', true]])
    expect(cards[0].img).toBe('/k/face-1.png')
    expect(cards[0].desc).toBe('straw hat, smock')
    expect(cards[1].apply).toBeUndefined()
    void cards[0].apply?.()
    expect(useLook).toHaveBeenCalledWith(card.versions[0].payload)
  })

  it('a version without a picture cannot be used: an older one is greyed; the current one just carries the check', () => {
    const noface: typeof card = { ...card, versions: [...card.versions, { version: 3, created: 't3', payload: { name: 'Beekeeper', description: 'no picture', references: [], sheets: [] } }] }
    const cards = castLookCards(noface, vi.fn())
    const last = cards.at(-1)!
    expect(last.current).toBe(true)
    expect(last.apply).toBeUndefined()
    const bare = castLookCards({ ...card, versions: [{ version: 1, created: 't', payload: { name: 'B', description: 'd', references: [], sheets: [] } }, card.versions[0]] }, vi.fn())
    expect(bare[0].disabled).toContain('no picture') // an older look with no face: greyed, never used
    expect(bare[1].current).toBe(true)
    expect(bare[1].apply).toBeUndefined() // the current one carries only the check
  })
})

describe('prop tile cards', () => {
  const element = { tag: 'hive', kind: 'prop' as const, refs: ['/e/hive-1.png', '/e/hive-2.png'], line: 'white-painted Langstroth hive' }

  it('the built tile first and current; the element’s other refs follow; using one rewrites the refs', () => {
    const useTile = vi.fn(async () => {})
    const cards = propTileCards({ tag: 'hive', name: 'Hive', element, builtLook: '/e/hive-2.png', desc: 'hive' }, useTile)
    expect(cards.map((c) => c.img)).toEqual(['/e/hive-2.png', '/e/hive-1.png']) // deduped, built first
    expect(cards[0].current).toBe(true)
    expect(cards[0].apply).toBeUndefined()
    expect(cards[0].desc).toBe('white-painted Langstroth hive') // words follow the element
    void cards[1].apply?.()
    expect(useTile).toHaveBeenCalledWith('/e/hive-1.png')
  })

  it('without a built tile the first ref is the current one; no element means no cards', () => {
    const cards = propTileCards({ tag: 'hive', name: 'Hive', element, builtLook: null, desc: 'hive' }, vi.fn())
    expect(cards[0].img).toBe('/e/hive-1.png')
    expect(cards[0].current).toBe(true)
    expect(propTileCards({ tag: 'hive', name: 'Hive', element: null, builtLook: null, desc: 'hive' }, vi.fn())).toEqual([])
  })
})

describe('the performer’s card (stale-cast-card, owner 2026-10-28)', () => {
  const cards = [{ id: 'sloane-1' }, { id: 'mara-2' }]
  const element = (cardId: string) => ({ tag: 'cook', kind: 'cast' as const, cardId, refs: [], line: 'a cook' })

  it('a fresh scene names nobody: no card is chosen even though the shared library holds saved cards', () => {
    expect(performerCard(cards, null, [])).toBeNull() // nobody plays, no scene element: nothing is ticked
    expect(performerCard(cards, undefined, null)).toBeNull() // the sheet not read yet: nobody until it is
  })

  it('the world’s performer names their card; the scene’s own cast element names theirs', () => {
    expect(performerCard(cards, 'mara-2', [])?.id).toBe('mara-2')
    expect(performerCard(cards, null, [element('sloane-1')])?.id).toBe('sloane-1')
    expect(performerCard(cards, 'gone-9', [element('sloane-1')])?.id).toBe('sloane-1')
  })
})

describe('which picks open the viewer on a double-click', () => {
  it('the performer (with a card) and a prop do; a plain kit piece does not', () => {
    expect(pickHasViewer({ pickKind: 'mark', hasCastCard: true })).toBe(true)
    expect(pickHasViewer({ pickKind: 'mark', hasCastCard: false })).toBe(false)
    expect(pickHasViewer({ pickKind: 'piece', item: item({ pieceTag: 'prop:hive' }), hasCastCard: false })).toBe(true)
    expect(pickHasViewer({ pickKind: 'piece', item: item(), hasCastCard: false })).toBe(false)
  })
})
