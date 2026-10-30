/**
 * The refusals (plan section 2.1): every row's plain-words message, checked before anything is sent. User-facing copy here
 * says "motion computer", the one term the UI uses everywhere (the plan's table said "motion maker"; the build steps settled
 * the copy call as "motion computer"). Nothing here or downstream names the generator, seeds or constraints. Pure.
 */
import { normalise } from './classify.ts'

export type RefusalReason = 'animals' | 'twoPeople' | 'handWork' | 'walking' | 'resting' | 'tooLong' | 'outOfReach'
export type Refusal = { reason: RefusalReason; message: string }

/** the longest window a made move can fill; a longer ask is refused (a hold after the move covers longer) */
export const MAX_SECONDS = 10

/** a live finding: the box cannot put down yet, nor pick up off the floor — one plain message for both, before anything is sent */
export const NOT_AVAILABLE_YET = 'This move is not available yet. Try one that takes something out of a container, picks something up from a table or bench, holds something up, or a simple gesture.'

/** a piece further than this (metres, on the Set, from the action point) cannot be reached */
export const REACH_M = 0.75

const ANIMALS = ['dog', 'cat', 'horse', 'bird', 'bee', 'chicken', 'cow', 'pig', 'sheep', 'goat', 'duck', 'rabbit', 'fox', 'deer', 'snake', 'donkey', 'mouse', 'frog', 'goose', 'turkey']
// handing or giving to someone, hugs, fights, dancing with: all two-person moves ("with both hands ... up to look" is her own hands:
// the noun after both / two / a possessive is never the verb)
const TWO_PEOPLE: (string | RegExp)[] = [/(?<!\b(?:both|two|her|his|their|my|your|its|the|one|bare) )\b(hand|hands|handed|handing|give|gives|gave|giving)\b[^.]{0,48}\bto\b/, 'hug', 'hugs', 'hugging', 'shake hands', 'shaking hands', 'fight', 'fights', 'fighting', 'dance with', 'dances with', 'dancing with', 'kiss', 'kisses', 'high five', 'highfive']
const HAND_WORK = ['open the lid', 'opens the lid', 'opening the lid', 'turn a key', 'turn the key', 'turns the key', 'pour', 'pours', 'pouring', 'screw', 'screws', 'screwing', 'unscrew', 'tie', 'ties', 'tying', 'thread', 'threads', 'threading', 'write', 'writes', 'writing', 'unlock', 'unlocks', 'stir', 'stirs', 'stirring', 'wring']
// carry or bring to somewhere, or walking off with something: the move is made on the spot, the path carries it after
const WALKING = [/\b(carry|carries|carried|carrying|bring|brings|brought|bringing)\b[^.]{0,48}\b(over|across|to the|toward|towards)\b/, /\bwalk(s|ed|ing)?\b[^.]{0,48}\bwith\b/]
const RESTING = ['sit on', 'sits on', 'sitting on', 'sat on', 'sit down on', 'sits down on', 'perch on', 'perches on', 'perching on', 'lie on', 'lies on', 'lying on', 'lay on', 'lie down on', 'climb on', 'climbs on', 'climbing on', 'climbed on', 'jump on', 'jumps on', 'jumping on', 'jumped on', 'lean on', 'leans on', 'leaning on', 'lean against', 'leans against']

const ROWS: [RefusalReason, (string | RegExp)[], string][] = [
  ['animals', ANIMALS, 'The motion computer makes human moves only. Creatures have their own moves on the Set.'],
  ['twoPeople', TWO_PEOPLE, 'This needs two people. The motion computer makes one person\'s moves at a time.'],
  ['handWork', HAND_WORK, 'This needs the hands to work the object itself, which the motion computer can\'t do yet. Try a move like \'reaches into the hive and lifts out a frame\'.'],
  ['walking', WALKING, 'Moves made here happen on the spot. Make the move here, then draw the path for the walk.'],
  ['resting', RESTING, 'This needs the body to rest on a set piece, which the motion computer can\'t do yet.'],
]

/** the six word-based refusal rows, first hit wins; null when the words pass */
export function refuseWords(raw: string): Refusal | null {
  const w = ` ${normalise(raw)} `
  for (const [reason, list, message] of ROWS) {
    const hit = list.some((p) => (typeof p === 'string' ? w.includes(` ${p} `) : p.test(w)))
    if (hit) return { reason, message }
  }
  if (durationOver(raw) !== null) return { reason: 'tooLong', message: 'A move can last up to 10 seconds. Use a hold after it for longer.' }
  return null
}

/** an asked duration over MAX_SECONDS, seconds, or null when no duration is asked (or it fits) */
export function durationOver(raw: string): number | null {
  const m = normalise(raw).match(/(?:for )?(a|an|\d+) (second|minute)s?\b/)
  if (!m) return null
  const n = m[1] === 'a' || m[1] === 'an' ? 1 : Number(m[1])
  const s = n * (m[2] === 'minute' ? 60 : 1)
  return s > MAX_SECONDS ? s : null
}

/** the asked duration in seconds when one is asked and it fits, else null (the caller keeps its default window) */
export function durationSeconds(raw: string): number | null {
  const m = normalise(raw).match(/for (a|an|\d+) (second|minute)s?\b/)
  if (!m) return null
  const n = m[1] === 'a' || m[1] === 'an' ? 1 : Number(m[1])
  const s = n * (m[2] === 'minute' ? 60 : 1)
  return s <= MAX_SECONDS ? s : null
}

/** the out-of-reach row: names the piece and the measured distance from the point */
export function outOfReach(pieceName: string, distanceM: number): Refusal {
  const d = distanceM.toFixed(1)
  return {
    reason: 'outOfReach',
    message: `The ${pieceName} is ${d} m from this point. Put the point within arm's reach of it, or move the ${pieceName} on the Set.`,
  }
}
