// The option rail's model (layout wave L2; L3 adds the Add mode and the redraw press; L5 no Discard): what the
// rail shows for each kind of selection — pure builders from the data that already exists. The performer's cast-card looks are the
// card's versions (the last is the current look); a prop's pictures are its Bible element's refs with the built tile first (the
// board's alternates move into the world at Build the set, so the element holds what a prompt can resolve); a plain kit piece swaps
// among the kit kinds. L3: a marked spot opens Add mode — the kit's kinds (a click places a piece
// there) or the set's props (placed as labelled stand-ins) and the drawn candidates (a pick becomes the scene's own prop and builds
// in 3D: stageProp.ts), with the "+ Generate a prop" card, whose screen draws candidates through the paid route. No route adds a
// person, so there is no person Add mode. L5: Discard is gone (no route discards a card-sized thing; kept looks stay with the set).
// Nothing here fetches or spends; the callers hand the data in.
import type { CardPayload, Ingredient } from '../../project/model'
import type { BibleElement } from '../../shared/bibleContract'
import type { PropParts } from '../../shared/sceneContract'
import type { KitItem } from '../../stage3d/contract'
import { KIT_PIECES, pieceOf } from '../../stage3d/kit'
import type { AddKind } from './railBus'

/** one card in the rail (and, when it has a picture, in the viewer) */
export interface RailCard {
  id: string
  name: string
  /** the words a prompt says for it — the viewer's read-only "Original prompt" */
  desc: string
  img: string | null
  /** the checked one: what the scene uses today */
  current: boolean
  /** L3: just redrawn or drawn — the NEW badge; never an overwrite of what was there */
  fresh?: boolean
  /** L3: the last card in Add mode ("+ Generate a prop"): its press opens the draw screen, not a route */
  gen?: AddKind
  /** the press that swaps this card in (absent on the current one) */
  apply?: () => Promise<void>
  /** L3: "What should change?" — the paid redraw press for a generated card (a cast look, a prop tile) */
  redraw?: { price: number; run: (change: string) => Promise<number> }
  /** greyed with this reason (no route applies it) */
  disabled?: string
  /** a drawn prop's ADVANCED edits at its draw (prop-edits-hold): its review reopens with them */
  parts?: PropParts
}

/** what the rail shows for one selection (or a marked spot in Add mode) */
export interface RailContent {
  /** "<name> — options" for a thing, "Add at the marked spot" in Add mode */
  title: string
  cards: RailCard[]
  /** a plain line when there is nothing to show (a built prop with no pictures, no cast card yet…) */
  note?: string
  /** the last apply's refusal, in words */
  error?: string | null
  /** L3 Add mode: the kind being added and the draw screen's press (the "+ Generate a prop" card). `price` is the draw's price at a
   *  count; `buildPrice` the 3D build a picked candidate starts (null until the pieces route is read) */
  add?: {
    kind: AddKind; at: [number, number]; price: (count: number) => number; draw: (name: string, description: string, count: number, parts?: PropParts) => Promise<string[]>; buildPrice?: number | null
    /** (add-prop-review) a candidate approved in the draw screen: placed at the marked spot as the scene's prop and its one 3D build
     *  started; throws in words when it was not placed (the dialog stays open and says so) */
    approve?: (look: { url: string; name: string; desc: string; parts?: PropParts }) => Promise<void>
  }
  /** L3 Add mode: an uploaded photo becomes a candidate as is (free); null when the upload route is unavailable */
  upload?: (f: File) => Promise<string>
  /** closes the rail and clears the selection */
  onClose: () => void
}

/** the kit's piece kinds the planner accepts, by their own names (the Set's Add list shows the same) */
export const SWAP_KINDS = Object.keys(KIT_PIECES).sort()

/** a plain kit piece's cards: every kit kind; the press swaps the piece to it through the piece route (place kept) */
export function kitSwapCards(item: KitItem, swap: (kind: string) => Promise<void>): RailCard[] {
  return SWAP_KINDS.map((kind) => ({
    id: kind, name: kind, desc: pieceOf(kind)?.doc ?? '', img: null,
    current: item.kind === kind,
    ...(item.kind === kind ? {} : { apply: () => swap(kind) }),
  }))
}

/**
 * The cast card the rail shows for the performer: the one the world names (performance castId), else the card of the scene's own
 * cast element (the build binds it in the Bible before anything names it on the world), never another scene's card from the shared
 * project — and never the library's first card either (stale-cast-card, owner 2026-10-28: a fresh scene starts with NO card chosen,
 * so a saved card is not ticked on a fresh world's performer). `elements` undefined = the Bible is not read yet (nobody until it
 * is); none known = nobody.
 */
export function performerCard<C extends { id: string }>(cards: C[], castId: string | null | undefined, elements: BibleElement[] | null | undefined): C | null {
  const named = castId ? cards.find((c) => c.id === castId) : undefined
  if (named) return named
  if (elements === undefined) return null
  const own = (elements ?? []).filter((e) => e.kind === 'cast' && e.cardId)
  for (const e of own) { const c = cards.find((x) => x.id === e.cardId); if (c) return c }
  return null
}

/** the performer's looks: one card per cast-card version, last one current; the press keeps the face and appends that version */
export function castLookCards(card: Ingredient<CardPayload>, useLook: (v: CardPayload) => Promise<void>): RailCard[] {
  const n = card.versions.length
  return card.versions.map((v, i) => ({
    id: `v${v.version}`, name: `${card.name} · look ${v.version}`, desc: v.payload.description,
    img: v.payload.references[0] ?? null, current: i === n - 1,
    ...(i === n - 1 ? {} : v.payload.references[0] ? { apply: () => useLook(v.payload) } : { disabled: 'This look has no picture to keep.' }),
  }))
}

/** a prop's pictures: the built tile first, then the rest of the element's refs; the press rewrites the element's refs */
export function propTileCards(o: { tag: string; name: string; element: BibleElement | null; builtLook: string | null; desc: string },
  useTile: (url: string) => Promise<void>): RailCard[] {
  const urls = [o.builtLook, ...(o.element?.refs ?? [])].filter((u): u is string => typeof u === 'string' && !!u)
  const seen = new Set<string>(), looks = urls.filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
  const current = o.builtLook ?? looks[0] ?? null
  return looks.map((url, i) => ({
    id: url, name: looks.length > 1 ? `${o.name} · ${i + 1}` : o.name, desc: o.element?.line ?? o.desc,
    img: url, current: url === current,
    ...(url === current ? {} : { apply: () => useTile(url) }),
  }))
}

/** a double-click on this pick opens the viewer: the performer (their card) or a prop (its element's pictures) */
export const pickHasViewer = (o: { pickKind: 'mark' | 'piece'; item?: KitItem | null; hasCastCard: boolean }): boolean =>
  o.pickKind === 'mark' ? o.hasCastCard : !!o.item?.pieceTag?.startsWith('prop:')

/** L3: the stand-in a new prop places as — a labelled kit piece (the crate reads "something stands here"; swap or scale it) */
export const STANDIN_KIND = 'crates'

/** L3 Add mode: the kit's kinds, one card each; the press places a new piece of that kind at the marked spot */
export function addPieceCards(place: (kind: string) => Promise<void>): RailCard[] {
  return SWAP_KINDS.map((kind) => ({
    id: kind, name: kind, desc: pieceOf(kind)?.doc ?? '', img: null, current: false,
    apply: () => place(kind),
  }))
}

/** L3 Add mode: one picture (an existing prop's or a drawn candidate's); the press places it at the spot */
export function addPropCard(o: { id: string; name: string; img: string | null; desc: string; parts?: PropParts }, place: () => Promise<void>): RailCard {
  return { id: o.id, name: o.name, desc: o.desc, img: o.img, current: false, apply: () => place(), ...(o.parts ? { parts: o.parts } : {}) }
}

/** L3 Add mode: the last card — its press opens the draw screen (name, words, priced Draw), never a route here */
export function addGenCard(): RailCard {
  return { id: '+new', name: '+ Generate a prop', desc: 'Describe a prop and draw candidates; the one you pick is placed and built in 3D.', img: null, current: false, gen: 'prop' }
}
