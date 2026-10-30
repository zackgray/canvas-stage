// Free-text moves (EXPERIMENTAL): words the verb table does not know go to the motion computer as they are written, as an
// on-the-spot body move with no hand targets. The words build a gesture-class spec marked `free`, so the result shows as a
// picker of options instead of one move. Free, local, no priced call anywhere on this path. Pure.
import { durationOver, durationSeconds, refuseWords, type MovePlan, type MoveSpec } from '../../../stage3d/moves/index.ts'

/** a spec made from free words; the mark rides with the spec to the server record so a reload still shows the picker */
export type FreeSpec = MoveSpec & { free: true }

export const isFreeSpec = (s: unknown): s is FreeSpec => !!s && typeof s === 'object' && (s as { free?: unknown }).free === true

export const EXPERIMENTAL = 'EXPERIMENTAL'
export const EXPERIMENTAL_NOTE = 'Experimental: your own words go straight to the motion computer. It tries several ways; you pick the one that looks right.'
/** what tends to work, as phrases that fill the words box; nothing that travels, no spin or kick */
export const HINT_MOVES: readonly string[] = ['squats down', 'kneels on one knee', 'crouches', 'stumbles forward and recovers', 'does a cartwheel', 'hops']
export const HINT_LINE = 'Moves that tend to work: squat, kneel, crouch, stumble, cartwheel, hop. Moves that travel (walks) are not made here.'
export const NONE_USABLE_LINE = 'None usable? Try other words, make another round, or use a ready-made move.'
export const FREE_NONE_LINE = 'Nothing came back that moves. Try other words, or use a ready-made move.'

const FREE_SECONDS = 6
/** sitting down on the ground is the one "rest on" ask that needs no piece */
const GROUND_SIT = /\bsit(?:s|ting)? down on (?:the |a )?(?:ground|floor)\b/i

/** the free spec for these words, or null when the words are not allowed free (every other refusal row still holds) */
export function freeSpec(words: string): FreeSpec | null {
  const w = words.trim().replace(/[.\s]+$/, '')
  if (!w || durationOver(w) !== null) return null
  const sentence = `A person stands still, then ${w.charAt(0).toLowerCase()}${w.slice(1)}.`
  return { class: 'gesture', sentence, seconds: durationSeconds(w) ?? FREE_SECONDS, keys: [], phases: [], free: true }
}

/** the plan after the verb table: an unknown verb, or the ground-sit refusal, becomes a free make; everything else is unchanged */
export function withFreeText(plan: MovePlan, words: string): MovePlan {
  if (!words.trim()) return plan
  const open = plan.kind === 'unknown' || (plan.kind === 'refused' && refuseWords(words)?.reason === 'resting' && GROUND_SIT.test(words))
  const spec = open ? freeSpec(words) : null
  return spec ? { kind: 'spec', spec, note: EXPERIMENTAL_NOTE } : plan
}
