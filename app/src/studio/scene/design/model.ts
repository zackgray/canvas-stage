// The Scene design model (mockup E): pieces (the board's tiles, each named by an @tag), their kinds, prices and tags. Pure.
import { frontCredits, MIN_CANDIDATES } from '../../../labs/projection/cast/api'
import { type ElementKind } from '../../../shared/bibleContract'

import { conceptCredits, type ConceptQuality } from '../../../shared/sceneContract'
import type { PieceType } from '../briefApi'

export type Cat = 'cast' | 'world' | 'light' | 'mats'
export type PieceState = 'draft' | 'approved' | 'yours'

export interface Piece {
  id: string
  tag: string
  name: string
  type: PieceType
  /** image URLs drawn or uploaded for it; `look` is the one in use */
  looks: string[]
  look: number
  state: PieceState
  /** the look line (what a prompt says for the tag) */
  line: string
  /** on the board (a Quick draft waits off it until Generate) */
  onBoard: boolean
  loading?: boolean
  /** a saved Cast card it came from, or the one saved from it when it was approved */
  cardId?: string
  /** the look that card was saved with (a new look approved saves the card's next version) */
  cardLook?: string
  /** why its image is missing (a failed or not-yet-wired draw) */
  problem?: string
  /** a billed concept draw whose images never landed: Recover fetches it by id (free) */
  recover?: { jobId: string; runId: string }
}

export const TYPE_LABEL: Record<PieceType, string> = {
  person: 'Person', creature: 'Creature', group: 'Group', prop: 'Prop', location: 'Location', mood: 'Mood', beat: 'Story beat', lighting: 'Lighting', material: 'Material',
}
export const CAT_OF: Record<PieceType, Cat> = {
  person: 'cast', creature: 'cast', group: 'cast', prop: 'mats', location: 'world', mood: 'world', beat: 'world', lighting: 'light', material: 'mats',
}
export const CATS: [Cat, string][] = [['cast', 'Cast'], ['world', 'Mood'], ['light', 'Lighting'], ['mats', 'Materials & props']]
/** chip colour class per type (cast blue/green, the look types warm) */
export const CHIP_CLS: Record<PieceType, string> = {
  person: '', creature: 'b', group: 'g', prop: 'w', location: 'w', mood: 'w', beat: 'w', lighting: 'w', material: 'w',
}

export const isCastFront = (t: PieceType) => t === 'person' || t === 'creature'
/** what `n` candidates of a type cost, rounded up: people and creatures are one Cast front job (at least MIN_CANDIDATES, one cold
 *  start each job: server/cast/prompts.ts), the rest Qwen concepts (full or draft) per image */
export const candidateCredits = (t: PieceType, n: number, q: ConceptQuality = 'full') =>
  isCastFront(t) ? frontCredits(Math.max(MIN_CANDIDATES, n)) : conceptCredits(q, n)
/** one look for the board (Generate the board, Redraw) */
export const pieceCredits = (p: Pick<Piece, 'type'>, q: ConceptQuality = 'full') => candidateCredits(p.type, 1, q)

let uid = 0
export function mkPiece(tag: string, name: string, type: PieceType, o: Partial<Piece> = {}): Piece {
  return { id: `p${Date.now().toString(36)}${++uid}`, tag, name, type, looks: [], look: 0, state: 'draft', line: '', onBoard: false, ...o }
}

/** a Bible tag from any word: lower-case, starts with a letter, 32 at most */
export function slug(s: string): string {
  const t = s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '').slice(0, 28)
  return t || 'ref'
}
/** the tag a hand-typed name means, or null when it names no tag at all (slug alone would turn "" or "!!" into "ref") */
export const slugStrict = (s: string): string | null => { const t = slug(s); return t === 'ref' && !/^\s*@?ref\s*$/i.test(s) ? null : t }
/** the longest idea the planner reads (server/planner/routes.ts INPUT.idea refuses more, for free, with a 400) */
export const IDEA_MAX = 2000
/** `tag` made unique against `taken` with 2, 3… */
export function uniqTag(tag: string, taken: readonly string[]): string {
  const base = slug(tag)
  if (!taken.includes(base)) return base
  for (let n = 2; ; n++) if (!taken.includes(`${base}${n}`)) return `${base}${n}`
}
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const done = (p: Piece) => p.state !== 'draft'
export const lookOf = (p: Piece): string | null => p.looks[p.look] ?? p.looks[0] ?? null

/** the tiles the board shows: the mood and lighting look-types are words of the brief, not tiles any more (nothing draws them) */
export const shownOnBoard = (p: Pick<Piece, 'type'>): boolean => p.type !== 'mood' && p.type !== 'lighting'

/** what a piece becomes in the Bible: cast-like pieces and materials are elements; the look types are words in the prompt */
export function elementKindOf(t: PieceType): ElementKind | null {
  return t === 'person' ? 'cast' : t === 'creature' ? 'creature' : t === 'group' ? 'extras' : t === 'material' ? 'material' : t === 'prop' ? 'prop' : null
}
