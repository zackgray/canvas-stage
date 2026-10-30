// The Set's top view saves through the kit world's own free routes (server/stage3d/plugin.ts): one piece scaled, removed or added
// (POST /piece, the route a piece drag already uses), the subject's mark (POST /mark). Each rewrites plan.json, so the set key
// (shoot/setKey.ts setKeyOf, a hash of the whole plan) changes with it, and fires KIT_CHANGED so every view re-reads the world.
import { KIT_CHANGED, STAGE3D_ROUTE } from '../../labs/projection/stage3d/kitApi'
import { gateSetEdit } from '../../labs/projection/stage3d/setEditGate'
import type { PieceMove } from '../../stage3d/contract'
import type { LabelPiece, MovePiece, SwapPiece } from '../stage/panels/blocking/usePieceDrag'

type Pt = [number, number]
/** `pieceTag` ('prop:<tag>'): the stand-in of a board prop tile, so the pieces route builds it and its mesh takes this place */
export interface NewPiece { kind: string; args?: number[]; at?: Pt; yawDeg?: number; scale?: number; label?: string; pieceTag?: string }
/** one piece edit: size, turn, base tilt (pitch/roll), height, travel (null clears it) or removal */
export type PiecePatch = { scale?: number; yawDeg?: number; pitchDeg?: number; rollDeg?: number; lift?: number; move?: PieceMove | null; remove?: true; frontDeg?: number }
export interface PlaceApi {
  /** the piece `index` (which must still be a `kind`) edited by `patch` */
  edit: (world: string, index: number, kind: string, patch: PiecePatch) => Promise<void>
  add: (world: string, piece: NewPiece) => Promise<void>
  mark: (world: string, at: Pt, yawDeg: number) => Promise<void>
  /** move or turn the piece `index` (a drag or a nudge from any view); default: the top view's own drag save (usePieceDrag movePiece) */
  move?: MovePiece
  /** the piece's own words (its label); default: the piece route's own call (usePieceDrag labelPiece) */
  label?: LabelPiece
  /** swap a library piece's kind, keeping its place, turn, size and words; default: the piece route's own call (usePieceDrag swapPiece) */
  swap?: SwapPiece
}

/** a refusal in plain words: the validator's own lines name pieces by list position and carry coordinates, so they are never shown */
export function plainRefusal(error: string | undefined, errors: string[] | undefined, status: number): string {
  if (errors?.some((e) => /outside|must be/.test(e))) return 'that would put a piece outside the limits of the set'
  if (errors?.length || status === 422) return 'the set would not be valid after this change'
  if (status === 409) return 'the set changed in the meantime; look again and retry'
  return error && !/[\[\]{}]|\.[a-z]+\[|HTTP/.test(error) ? error : 'it could not be saved'
}

/** any refusal text reaching the Set (the piece-drag route has its own) with the validator's list positions or coordinates cut out */
export function plainSay(message: string): string {
  const cut = message.split(': kit[')[0].replace(/\s*kit\[\d+\].*$/s, '')
  return /\[|\]/.test(cut) || !cut.trim() ? 'the set would not be valid after this change' : cut
}

async function post(route: string, world: string, body: unknown): Promise<void> {
  gateSetEdit(world) // a take on show with its own other set: refused, nothing sent (setEditGate.ts)
  const res = await fetch(`${STAGE3D_ROUTE}/${route}?id=${encodeURIComponent(world)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { error?: string; errors?: string[] }
    throw new Error(plainRefusal(b.error, b.errors, res.status))
  }
  window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id: world } }))
}

export const placeApi: PlaceApi = {
  edit: (world, index, kind, patch) => post('piece', world, { index, kind, ...patch }),
  add: (world, add) => post('piece', world, { add }),
  mark: (world, at, yawDeg) => post('mark', world, { at, yawDeg }),
}
