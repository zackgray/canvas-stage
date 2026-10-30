/**
 * The face pass's two prompts (recipe step 6, E143 arm s; prompt wave track D). The window render is one close-up sentence naming the
 * person and, when the brief gives this person a beat, what they do at the face's scale (its `does`, then its `visible` cue: "…, who lifts
 * the frame from the hive, squinting into the sun"); then the LTX guide shape. The Klein frame -1 redraw keeps the light on the face
 * exactly as image 1 has it (never a recipe's "shade and rim"), and no stock expression: the beat's visible cue when there is one.
 */
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import { briefOf, briefWords } from './stagedDefault.ts'

/** what this person does in the brief, at face scale: the first beat whose `who` is their tag ('' parts when the brief says nothing) */
export interface FaceCue { does: string; visible: string }

const short = (s: string) => s.replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0].replace(/\.$/, '').slice(0, 220)
const bare = (s: string) => s.trim().replace(/[.!?]+$/, '')

/** the cue for the person whose Cast card is `cardId`, from the Bible's v2 brief; null without one */
export function faceCue(bible: BibleRecord | null, cardId: string | null): FaceCue | null {
  const brief = briefOf(bible)
  const tag = cardId ? bible?.elements.find((e) => e.cardId === cardId)?.tag : undefined
  if (!brief || !tag) return null
  const beat = brief.beats.find((b) => b.who.trim().replace(/^@/, '') === tag && (b.does?.trim() || b.visible?.trim()))
  if (!beat) return null
  const words = briefWords(brief)
  return { does: bare(words(beat.does ?? '')), visible: bare(words(beat.visible ?? '')) }
}

/** ", who lifts the frame from the hive, squinting into the sun" (the description stays the subject: no verb to conjugate); '' = nothing */
const cueWords = (c: FaceCue | null | undefined) => `${c?.does ? `, who ${c.does}` : ''}${c?.visible ? `, ${c.visible}` : ''}`

/** the Klein frame -1 redraw: the face only, from the card, in the light image 1 already has (E143 FACE, scene-agnostic) */
export const facePrompt = (desc: string, cue?: FaceCue | null) => 'A real photograph. In image 1, redraw only the face of the person in the middle as the face of the person in image 2' +
  `${desc ? `: ${short(desc)}` : ''}. Keep their hair and any hat, and the head's size, position, tilt and turn exactly as in image 1. ` +
  `Keep the light on the face exactly as in image 1, and its colours. Natural skin with real texture, ${cue?.visible ? cue.visible : 'clear eyes'}.`

/** the window render: one close-up sentence naming the person and their beat at face scale, then the LTX guide shape (recipe step 5) */
export const windowPrompt = (desc: string, cue?: FaceCue | null) => `A close-up of the face of ${desc ? short(desc) : 'the person in the middle'}${cueWords(cue) || ', as they move through the shot'}. ` +
  'Match the first frame: the same face, hair and clothes, the same light. Photoreal, natural skin, real eyes.'
