// Moving onto the board; the @ menu's rows. Pure (Design in, the change out).
import type { PieceType } from '../briefApi'
import { freshGuided, guidedPieces, liveBriefText, type Guided } from './guided'
import { guidedV2 } from './guidedV2'
import { initialGuided } from './guidedStart'
import { lookOf, type Piece } from './model'
import type { Design } from './state'
import type { LibItem } from './useDesign'

/** opening Guided: it starts from what the design already holds (saved cast used as is, the developed lines) */
export const openRoute = (d: Design): Partial<Design> =>
  ({ screen: 'guided', route: 'guided', guided: d.guided ?? initialGuided(d) ?? freshGuided() })

/** Guided's picks onto the board: approved tiles and the brief from the picks (only what was picked reaches the board) */
export function finishGuided(d: Design, g: Guided): Partial<Design> {
  // cast used as is keeps its tile; every other tile comes from this pass's picks
  const fixedKept = d.pieces.filter((p) => g.cast.some((c) => c.fixed?.tag === p.tag && c.name.trim()))
    .map((p) => ({ ...p, onBoard: true }))
  const made = guidedPieces(g, fixedKept)
  const pieces = [...fixedKept, ...made.pieces]
  return {
    pieces, brief: liveBriefText(g), v2: guidedV2(g, pieces, d.v2), v2Stale: true, route: 'guided', edited: false,
    panels: { ...d.panels, brief: true },
    lighting: made.lighting || d.lighting, materials: made.materials || d.materials, action: made.action || d.action,
    phase: 'board', screen: 'board',
  }
}

export type AtRow = { tag: string; name: string; type: PieceType; look: string | null; draft: boolean; lib?: LibItem }
/** the @ menu: this scene's tiles, then saved cards not yet in it, matching what is typed after the @ */
export function atRows(pieces: readonly Piece[], lib: readonly LibItem[], q: string): AtRow[] {
  const rows: AtRow[] = [
    ...pieces.map((p) => ({ tag: p.tag, name: p.name, type: p.type, look: lookOf(p), draft: p.state === 'draft' })),
    ...lib.filter((l) => !pieces.some((p) => p.tag === l.tag)).map((l) => ({ tag: l.tag, name: l.name, type: l.type, look: l.look, draft: false, lib: l })),
  ]
  return rows.filter((r) => !q || r.tag.startsWith(q) || r.name.toLowerCase().includes(q))
}
