/**
 * Phase words per class (plan section 2.4): the same shape as the library clips' ClipPhase, so the still at a frame says the
 * pose it is in (E146's lesson — never the whole beat) and plugs into the lift track's phase reader unchanged. A still at t = 0
 * never names the object in hand: moves that start with empty hands say so, and moves that start holding say where the hands
 * are without naming what they carry (the still and render draw what the words name over the hands anyway). Times scale with
 * the asked window, like the keys. Pure.
 */
import { gesturePhrase, withArticle } from './sentence.ts'
import type { MoveClass, MovePhase } from './types.ts'

export type PhaseNames = {
  /** the picked piece's short name, for "the stool" (unused by gestures) */
  piece?: string
  /** the handled object's noun, no article */
  object?: string
  /** the gesture verb, for the gesture class */
  verb?: string
}

const at = (n: number, s: number): number => Math.round(n * (s / 8) * 100) / 100

export function movePhases(cls: MoveClass, names: PhaseNames, seconds: number): MovePhase[] {
  const piece = names.piece ?? 'piece'
  const obj = withArticle(names.object ?? 'object')
  switch (cls) {
    case 'takeOut':
      return [
        { from: 0, words: `standing at the ${piece}, both hands empty` },
        { from: at(1.3, seconds), words: `bending over the ${piece}, reaching into it with both hands, the hands still empty` },
        { from: at(2.5, seconds), words: `lifting ${obj} out of the ${piece} with both hands` },
        { from: at(4.3, seconds), words: `holding ${obj} up at head height in both hands, looking at it` },
      ]
    case 'pickUp':
      return [
        { from: 0, words: `standing at the ${piece}, both hands empty` },
        { from: at(0.8, seconds), words: `bending down to the ${piece}, reaching for it with both hands, the hands still empty` },
        { from: at(2, seconds), words: `lifting ${obj} from the ${piece} with both hands` },
        { from: at(4, seconds), words: `holding ${obj} at chest height in both hands` },
      ]
    case 'putDown':
      return [
        { from: 0, words: 'standing with both hands held at chest height' },
        { from: at(2, seconds), words: `lowering ${obj} toward the ${piece} with both hands` },
        { from: at(4.5, seconds), words: `placing ${obj} on the ${piece}, letting go with both hands` },
        { from: at(6, seconds), words: `straightening up from the ${piece}, both hands empty` },
      ]
    case 'holdUp':
      return [
        { from: 0, words: 'standing still, both hands held at chest height' },
        { from: at(1, seconds), words: `raising ${obj} with both hands` },
        { from: at(4, seconds), words: `holding ${obj} up at head height in both hands, looking at it` },
      ]
    case 'gesture':
      return [
        { from: 0, words: 'standing still, both hands empty' },
        { from: at(0.8, seconds), words: gesturePhrase(names.verb) },
      ]
  }
}
