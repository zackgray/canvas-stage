// Cast cards for the board's people and creatures (wave 3 M1). A person or creature drawn in Quick or Guided is a Cast front, not a
// card; the Bible's cast element, Blocking's "Played by" and the still's face all need a saved card. So an approved tile saves one
// (free): its look kept as the card's face, its line as the description, the card id recorded on the tile. Saved again only when a
// different look is approved; a card picked from the project ('yours') is used as is.
import type { BriefApi } from '../briefApi'
import { drawCardId } from '../briefApi'
import { done, isCastFront, lookOf, type Piece } from './model'

/** a tile that should have a card and has none for its current look */
export function needsCard(p: Piece): boolean {
  const look = lookOf(p)
  if (!isCastFront(p.type) || !p.onBoard || !done(p) || !look) return false
  if (p.state === 'yours' && p.cardId) return false
  return !p.cardId || p.cardLook !== look
}

/** the card a tile's save writes (its card id kept once it has one, so a new look is the same card's next version) */
export const cardFor = (p: Piece) => ({ cardId: p.cardId ?? drawCardId(p.name || p.tag), name: p.name || p.tag, description: p.line, face: lookOf(p)! })

/**
 * Saves the card for each tile that needs one, in order, once per tile and look even when asked twice at the same time.
 * `patch` records `cardId` / `cardLook` on the tile; returns the pieces with those applied. Throws the first refusal.
 */
export function cardSaver(api: Pick<BriefApi, 'saveCard'>) {
  const inFlight = new Map<string, Promise<Pick<Piece, 'cardId' | 'cardLook'>>>()
  const one = (p: Piece) => {
    const key = `${p.id} ${lookOf(p)}`
    let run = inFlight.get(key)
    if (!run) {
      const c = cardFor(p)
      run = api.saveCard(c).then(() => ({ cardId: c.cardId, cardLook: c.face }))
      run.catch(() => {}).finally(() => inFlight.delete(key))
      inFlight.set(key, run)
    }
    return run
  }
  return async (pieces: readonly Piece[], patch: (id: string, p: Partial<Piece>) => void): Promise<Piece[]> => {
    const out: Piece[] = []
    for (const p of pieces) {
      if (!needsCard(p)) { out.push(p); continue }
      const got = await one(p)
      patch(p.id, got)
      out.push({ ...p, ...got })
    }
    return out
  }
}
export type SaveCards = ReturnType<typeof cardSaver>
