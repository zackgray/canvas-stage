/**
 * The edit's prompt (draw-from-master plan section 2.1 step C), in the shape that worked in round2-qwen-edit (edit-B-1mp), with
 * the scene's own words substituted: picture 1 is the real photograph of the place; keep it exactly; add one person where the
 * figure line puts her, doing the pose words; she wears exactly the clothes of picture 2 and has the face of picture 3; she is
 * alone; take nothing else from pictures 2 and 3; and the one new, untested sentence that answers the invented hives: add nothing
 * else to the place. Positive words only, and no negative (the graph has none). Pure.
 */
import { pronounOf, type Pronoun } from './onePerson.ts'

export interface EditPromptParts {
  /** the place whole, one clause ("an old apple orchard, autumn, late afternoon") */
  place: string
  /** the pieces the camera sees, by name ("the white wooden beehive", "apple trees"), already short */
  pieces: string[]
  /** the main prop's plain noun, singular ("stool"), for the "no extra …" clause; '' = "add nothing else" alone */
  prop: string
  /** figures.ts figureWords for the hero: where, how tall, cut by which edge */
  figure: string
  /** her pose or action at this frame as one ready sentence ("The beekeeper tends her hives."), '' = none known */
  doing: string
  /** the cast card's description (its garments are the clothes of picture 2) */
  description: string
  /** picture 1 is the approved master seen from this camera: its black areas were never seen */
  projected?: boolean
}

const strip = (s: string) => s.replace(/[.\s]+$/, '')
const lowerFirst = (s: string) => s.replace(/^(A|An|The) /, (m) => m.toLowerCase())
const upperFirst = (s: string) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s)
const SUBJECT: Record<Pronoun, string> = { She: 'woman', He: 'man', They: 'person' }

/** the card's garment list: its clauses after the subject ("a woman in her fifties, with a white coverall, a straw hat" -> "a white coverall, a straw hat"); the whole card when it has no clause after the subject */
export function garmentsOf(description: string): string {
  const one = strip(description.split(/[.!?](\s|$)/)[0] ?? '')
  const bits = one.split(/,\s+/)
  const rest = bits.length > 1 ? bits.slice(1).join(', ').replace(/^with\s+/i, '') : one
  return lowerFirst(strip(rest))
}

export function buildEditPrompt(p: EditPromptParts): string {
  const who = pronounOf(p.description)
  const pieces = p.pieces.length ? `, ${p.pieces.join(', ')}` : ''
  return [
    `Picture 1 is a real photograph of ${strip(p.place) || 'a place'}.`,
    `Keep picture 1 exactly as it is: the same location, camera, framing and light${pieces}.`,
    `Add one ${SUBJECT[who]} to it.`,
    p.figure ? upperFirst(strip(p.figure)) + '.' : '',
    upperFirst(strip(p.doing)) ? `${upperFirst(strip(p.doing))}.` : '',
    `${who} wears exactly the clothes of the ${SUBJECT[who]} in picture 2: ${garmentsOf(p.description)}.`,
    `${who} has the face of the ${SUBJECT[who]} in picture 3.`,
    `${who} ${who === 'They' ? 'are' : 'is'} alone in the picture, the only person in it.`,
    'Take nothing else from pictures 2 and 3: not their camera, framing or background.',
    // (stage-only) only the scene's own main piece is named; the old fixed "trees, gates or walls" came from one test scene
    p.prop ? `Add nothing else to the place: no extra ${p.prop}s.` : 'Add nothing else to the place.',
    p.projected ? 'The black areas of picture 1 are unseen: the place continues there as it does in the rest of the picture.' : '',
  ].filter(Boolean).join(' ')
}
