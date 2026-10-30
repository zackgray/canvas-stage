// Who the scene names, for The subject's "Who plays them" card. Pure, except the small hook that reads the sheet's cast.
//   withoutLook: the people with no look yet: the Guided cast cards (Develop's or an old Brief's) not used yet whose name or tag
//     no person tile or sheet element already has (an old Brief's picked card is a tile already), and any person tile with no
//     Cast card; each names the Guided card the maker works on (null: one is made from the tile when it opens).
//   withCard: the sheet's cast elements that point at a Cast card (who can play the subject), named from their tile or card.
import { useCallback, useEffect, useState } from 'react'
import type { CardPayload, Ingredient } from '../../../project/model'
import type { BibleElement } from '../../../shared/bibleContract'
import { BIBLE_CHANGED, type BibleApi } from '../../scene/bibleApi'
import { castTag, type CastCard } from '../../scene/design/guided'
import type { Piece } from '../../scene/design/model'
import type { Design } from '../../scene/design/state'

export interface NoLook { key: string; name: string; desc: string; card: CastCard | null; tile: Piece | null }
export interface WithCard { tag: string; cardId: string; name: string }

const same = (a: string, b: string) => !!a.trim() && a.trim().toLowerCase() === b.trim().toLowerCase()

/** the Guided card a person tile is made through: one used for it, or one of the same name */
export const cardOfTile = (d: Pick<Design, 'guided'>, p: Piece): CastCard | null =>
  d.guided?.cast.find((c) => c.fixed?.tag === p.tag) ?? d.guided?.cast.find((c) => c.type === 'person' && same(c.name, p.name)) ?? null

export function withoutLook(d: Pick<Design, 'guided' | 'pieces'>, sheet: readonly BibleElement[]): NoLook[] {
  const people = d.pieces.filter((p) => p.type === 'person')
  const cards = (d.guided?.cast ?? []).filter((c) => c.type === 'person' && !c.fixed && c.name.trim()
    && !people.some((p) => same(p.name, c.name) || p.tag === castTag(c)) && !sheet.some((e) => e.kind === 'cast' && e.tag === castTag(c)))
  const tiles = people.filter((p) => !p.cardId)
  return [
    ...cards.map((c) => ({ key: `card:${c.id}`, name: c.name.trim(), desc: c.desc, card: c, tile: null })),
    ...tiles.map((p) => ({ key: `tile:${p.id}`, name: p.name || p.tag, desc: p.line, card: cardOfTile(d, p), tile: p })),
  ]
}

export function withCard(d: Pick<Design, 'pieces'>, sheet: readonly BibleElement[], cards: readonly Ingredient<CardPayload>[]): WithCard[] {
  return sheet.filter((e) => e.kind === 'cast' && !!e.cardId).map((e) => ({
    tag: e.tag, cardId: e.cardId!,
    name: d.pieces.find((p) => p.tag === e.tag)?.name || cards.find((k) => k.id === e.cardId)?.name || `@${e.tag}`,
  }))
}

/** a project card's newest look: its full-body front (references[0]), else its first sheet */
export const cardLook = (k: Ingredient<CardPayload> | undefined): string | null =>
  k?.versions.at(-1)?.payload.references[0] ?? k?.versions.at(-1)?.payload.sheets[0] ?? null

/** the sheet's elements, read again after any sheet write (null until read) */
export function useSheetElements(bible: BibleApi, worldId: string | null): { elements: BibleElement[] | null; reread: () => void } {
  const [got, setGot] = useState<{ id: string; elements: BibleElement[] } | null>(null)
  const [n, setN] = useState(0)
  const reread = useCallback(() => setN((k) => k + 1), [])
  useEffect(() => {
    if (!worldId) return
    let live = true
    const read = () => bible.get(worldId).then((r) => { if (live) setGot({ id: worldId, elements: r.bible?.elements ?? [] }) },
      () => { if (live) setGot({ id: worldId, elements: [] }) })
    void read()
    window.addEventListener(BIBLE_CHANGED, read)
    return () => { live = false; window.removeEventListener(BIBLE_CHANGED, read) }
  }, [bible, worldId, n])
  return { elements: got && got.id === worldId ? got.elements : null, reread }
}
