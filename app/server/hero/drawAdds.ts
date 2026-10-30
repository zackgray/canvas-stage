/**
 * The draw words the app adds to the user's own (prompt-fix pass, 2026-10-30), each shown at the press as "Added by the app" with a
 * switch per take that the server honours: `castRest`, the cast card's sentences after its first (a card's "He's dressed in …"), and
 * `frameTail`, the pieces in view and the cut-at-the-top line. Absent or true = added (today's behaviour); false = left out. The
 * figures' size and place, the angle and the lens feel are geometry the depth lock needs (E130) and always go. Pure.
 */
import type { DrawAddKey } from '../../src/shared/stillPressContract.ts'
import { stripOpener } from '../prompt/sceneWords.ts'

/** the request's switches; a missing key is on */
export type DrawAdds = Partial<Record<DrawAddKey, boolean>>
export const DRAW_ADD_KEYS: readonly DrawAddKey[] = ['castRest', 'frameTail']

export const addOn = (adds: DrawAdds | undefined, key: DrawAddKey): boolean => adds?.[key] !== false

/** a card description's whole sentences, its drawing opener off */
const sentences = (d: string): string[] => stripOpener(d.trim()).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)

/** the card's first sentence alone (castRest off) */
export const cardHead = (d: string): string => sentences(d)[0] ?? ''
/** the card's sentences after its first: what castRest adds */
export const cardRest = (d: string): string => sentences(d).slice(1).join(' ')

/** a request body's `drawAdds`, checked: an object of known keys to booleans, else undefined (400 is the caller's) */
export function parseDrawAdds(v: unknown): DrawAdds | undefined | 'bad' {
  if (v === undefined) return undefined
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'bad'
  const out: DrawAdds = {}
  for (const [k, b] of Object.entries(v)) {
    if (!(DRAW_ADD_KEYS as readonly string[]).includes(k) || typeof b !== 'boolean') return 'bad'
    out[k as DrawAddKey] = b
  }
  return out
}
