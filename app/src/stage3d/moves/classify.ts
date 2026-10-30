/**
 * The verb table (plan section 2.1): the user's words are matched against a fixed table of phrasings, one move class per row,
 * deterministic and free (no LLM, decision D4). One class picked; two matching rows return chips for the panel to ask with;
 * none returns unknown. Refusals are checked before this (refuse.ts). Pure.
 */
import type { MoveClass } from './types.ts'

export type ClassifyResult =
  | { class: MoveClass }
  | { ambiguous: MoveClass[] }
  | { unknown: true }

/** the chip labels the panel shows, e.g. "Do you mean: Pick it up · Put it down?" */
export const CLASS_LABELS: Record<MoveClass, string> = {
  takeOut: 'Take it out',
  pickUp: 'Pick it up',
  putDown: 'Put it down',
  holdUp: 'Hold it up',
  gesture: 'Gesture',
}

/**
 * The table, checked in this order (first match wins the chip order). Phrasings are substrings of the normalised words
 * (lower-case, punctuation stripped), so both "take a frame out" and "takes the frame out of the hive" hit the same row.
 */
const TABLE: [MoveClass, (string | RegExp)[]][] = [
  ['takeOut', ['take out', 'takes out', 'taking out', 'took out', 'lift out', 'lifts out', 'lifting out', 'pull out', 'pulls out', 'pulling out', 'out of the hive', 'out of the box', 'out of the crate', 'out of it', 'out of']],
  ['pickUp', ['pick up', 'picks up', 'picking up', 'picked up', 'lift from the floor', 'lift from the ground', 'lift from the table', 'lifts from the floor', 'lifts from the ground', 'lifts from the table', 'lifting from the floor', 'lifting from the ground', 'lifting from the table', 'from the floor', 'from the ground', 'from the table', 'pick it up', 'pick it off']],
  ['putDown', [/\b(put|puts|putting|set|sets|setting|lay|lays|laying|place|places|placing)\b[^.]{0,32}\b(down|back)\b/, /\bplace[sd]?\b[^.]{0,24}\b(on|onto|in|into)\b/, 'put down', 'puts down', 'set down', 'lay down', 'place on', 'place in', 'put it back', 'put it down']],
  ['holdUp', [/\b(hold|holds|holding|held)\s+(?!(it|them|this|that)\b)([\p{L}']{1,24}\s+){1,3}up\b/u, 'hold up', 'holds up', 'holding up', 'held up', 'raise', 'raises', 'raising', 'raised', 'show', 'shows', 'showing', 'showed', 'look at it', 'looks at it', 'look at the', 'looks at the']],
  ['gesture', ['wave', 'waves', 'waving', 'point', 'points', 'pointing', 'beckon', 'beckons', 'beckoning', 'shrug', 'shrugs', 'shrugging', 'stretch', 'stretches', 'stretching', 'look around', 'looks around', 'looking around', 'wipe', 'wipes', 'wiping', 'clap', 'claps', 'clapping']],
]

/** the rows a phrase selects; >1 row is the ambiguity the panel resolves with chips */
export function matchingClasses(words: string): MoveClass[] {
  const w = normalise(words)
  return TABLE.filter(([, phrases]) => phrases.some((p) => (typeof p === 'string' ? w.includes(p) : p.test(w)))).map(([cls]) => cls)
}

export function classify(words: string): ClassifyResult {
  const hits = matchingClasses(words)
  if (hits.length === 1) return { class: hits[0] }
  if (hits.length > 1) return { ambiguous: hits }
  return { unknown: true }
}

/** the first gesture verb the words carry ("she waves at the hive" → "wave"), for the gesture sentence and phases */
export function gestureVerb(words: string): string | undefined {
  const w = normalise(words)
  return ['look around', 'wipe', 'beckon', 'shrug', 'stretch', 'clap', 'point', 'wave'].find((v) => w.includes(v))
}

/** lower-case, punctuation collapsed to spaces, whitespace squeezed: the form every table entry and refusal list matches on */
export function normalise(words: string): string {
  return words.toLowerCase().replace(/[^\p{L}\p{N}'’ ]+/gu, ' ').replace(/['’]/gu, "'").replace(/\s+/g, ' ').trim()
}
