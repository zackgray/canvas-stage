/**
 * The sentence the generator reads (plan section 2.2): one template per class, in the "A person …" caption style the model was
 * trained on, always opening "A person stands still, then …" (a standing start keeps the crossfade from the path clean). It
 * names the handled object and carries the manner adverb; the container is always "a box in front of them" — the model knows
 * boxes, and the Set piece's own name goes to the still prompt, not here. The takeOut template is the spike's winning c15
 * wording exactly, with only the manner adverb and the object noun varying (verified in tests). Pure.
 */
import type { MoveClass } from './types.ts'

export type SentenceBits = {
  /** the handled object's noun, no article ("flat frame"); falls back per class when the words don't name one */
  object?: string
  /** the manner adverb from the words (undefined = none inserted; no default) */
  manner?: string
  /** the gesture verb, for the gesture class */
  verb?: string
}

/**
 * The fallback object noun, used only when the words name no object. Plan 2.2: the noun comes from the user's words, so the
 * fallback names no particular thing (QA run 5: a baker's tray came out as the beekeeper's "flat frame").
 */
const DEFAULT_OBJECT = 'object'

/** "a tray", "an object": the noun with the article it takes */
export const withArticle = (noun: string): string => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`

const GESTURE_PHRASES: Record<string, string> = {
  wave: 'waves one hand', point: 'points with one hand', beckon: 'beckons with one hand', shrug: 'shrugs',
  stretch: 'stretches', 'look around': 'looks around', wipe: 'wipes their brow', clap: 'claps their hands',
}

export function moveSentence(cls: MoveClass, bits: SentenceBits): string {
  const obj = withArticle(bits.object ?? DEFAULT_OBJECT)
  const m = bits.manner ? `${bits.manner} ` : ''
  switch (cls) {
    case 'takeOut':
      return `A person stands still, then bends at the waist and reaches into a box in front of them with both hands, ${m}lifts out ${obj}, and holds it up in front of their face to look at it against the light.`
    case 'pickUp':
      return `A person stands still, then bends down and picks up ${obj} with both hands, ${m}lifts it to chest height, and holds it.`
    case 'putDown':
      return `A person stands still, then ${m}lowers ${obj} with both hands, places it down, and stands up straight.`
    case 'holdUp':
      return `A person stands still, then ${m}raises ${obj} with both hands and holds it up at head height.`
    case 'gesture':
      return `A person stands still, then ${m}${gesturePhrase(bits.verb)}.`
  }
}

/** the body phrase a gesture verb maps to; an unmapped verb is used as the user wrote it */
export function gesturePhrase(verb?: string): string {
  if (!verb) return 'makes a small gesture'
  const v = verb.toLowerCase()
  return GESTURE_PHRASES[v] ?? v
}

/**
 * The handled object's noun from the user's words: the noun between the verb and the destination ("takes a frame out of the
 * hive", "picks up a crate", "puts the crate down"). Falls back per class when no noun is there.
 */
export function extractObject(words: string, cls: MoveClass): string | undefined {
  const w = words.toLowerCase().replace(/\s+/g, ' ').trim()
  const pick = (re: RegExp): string | undefined => {
    const m = w.match(re)
    return m ? m[1].replace(/\s+(from|out of|onto|into|on|in|down|up|over)$/u, '').trim() : undefined
  }
  switch (cls) {
    case 'takeOut':
      // any verb the user chose ("slides a tray of loaves out of the oven"): the words between an article and "out of"; a
      // phrase without one ("takes it out of the hive") names no object
      return pick(/\b(?:take|takes|taking|took|lift|lifts|lifting|pulled|pull|pulls|pulling)\b(?:\s+it)?(?:\s+out)?\s+(?:a|an|the|their)\s+(.+?)\s+out of\b/)
        ?? pick(/\b(?:a|an|the|their|some)\s+((?:(?!(?:a|an|the|their|some)\b)[\p{L}'-]+\s+){0,3}[\p{L}'-]+)\s+out of\b/u)
    case 'pickUp':
      return pick(/\bpick(?:s|ing|ed)?\s+up\s+(?:a|an|the|their)\s+(.+)/) ?? pick(/\blift(?:s|ing)?\s+(?:a|an|the|their)\s+(.+?)\s+from\b/)
    case 'putDown':
      return pick(/\b(?:put|puts|putting|set|sets|setting|lay|lays|laying|place|places|placing)\b(?:\s+it)?\s+(?:down\s+|back\s+)?(?:a|an|the|their)\s+(.+?)\s+(?:down\s+)?(?:on|onto|in|into)\b/)
    case 'holdUp':
      return pick(/\b(?:hold|holds|holding|raise|raises|raising|show|shows|showing)\s+(?:up\s+)?(?:a|an|the|their)\s+(.+?)(?:\s+up)?\s+(?:to|at)\b/)
    case 'gesture':
      return undefined
  }
}
