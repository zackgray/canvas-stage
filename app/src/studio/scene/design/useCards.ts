// The board's Cast cards, saved as soon as a person or creature is approved (free; cards.ts, wave 3 M1). The one effect in the design
// calls, and it never spends. Build the set awaits the same saver, so a card is never saved twice for one look.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { BriefApi } from '../briefApi'
import { cardSaver, needsCard } from './cards'
import { lookOf, type Piece } from './model'
import type { DesignState } from './useDesign'

const cardKey = (p: Piece) => `${p.id} ${lookOf(p)}`
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useCards(s: Pick<DesignState, 'd' | 'ref' | 'patchPiece'>, api: Pick<BriefApi, 'saveCard'>, onError: (m: string) => void) {
  const { patchPiece, ref } = s
  const saver = useMemo(() => cardSaver(api), [api])
  const cards = useCallback((pieces: readonly Piece[]) => saver(pieces, patchPiece), [saver, patchPiece])
  const failed = useRef(new Set<string>())
  const wanted = s.d.pieces.filter(needsCard).map(cardKey).join('|')
  useEffect(() => {
    if (!wanted) return
    const todo = ref.current.pieces.filter((p) => needsCard(p) && !failed.current.has(cardKey(p)))
    if (!todo.length) return
    // a refusal is said once and not retried on its own; Build the set tries again before it spends
    cards(todo).catch((e: unknown) => { for (const p of todo) failed.current.add(cardKey(p)); onError(`The Cast card was not saved: ${message(e)}`) })
  }, [wanted, cards, ref, onError])
  return cards
}
