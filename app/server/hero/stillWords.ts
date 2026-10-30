/**
 * The scene words of a still (stage-only plan, section 5: the scene words lead the draw). The text is the Bible's scene prompt, the
 * drawer's words as the sheet sync keeps them, with each @tag said in words by the one tag rule (prompt/sceneWords.ts, owner
 * 10-29): the hero's first mention by the whole card when they are in the frame, a prop's or material's by its line on the sheet,
 * a cast member nobody on the set plays left out. The card is said once, there, and never again as a block of its own. Pure.
 */
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../src/shared/briefContract.ts'
import { elementCards, sceneWords } from '../prompt/sceneWords.ts'
import { briefElement } from './stillBrief.ts'

export function stillScene(o: { bible: BibleRecord | null; brief: SceneBriefV2 | null; heroTag: string | null; inFrame: boolean
  cast: { name: string; description: string } }): { words: string } {
  const text = o.bible?.prompt?.trim() ?? ''
  if (!text || !o.bible) return { words: '' }
  const cast = o.bible.elements.filter((e) => e.kind === 'cast').map((e) => e.tag)
  // the hero is the one person the set stages; with no hero known nothing is dropped (never lose the words to a guess)
  const drop = o.heroTag ? cast.filter((t) => t !== o.heroTag) : []
  const elements = o.bible.elements.map((e) => ({ tag: e.tag, kind: e.kind, name: e.tag === o.heroTag ? o.cast.name : briefElement(o.brief, e.tag)?.name }))
  // the hero out of the frame is named, not described (the depth has no body for them)
  const cards = elementCards(o.bible.elements.filter((e) => e.kind !== 'cast' || (e.tag === o.heroTag && o.inFrame)), {},
    o.heroTag && o.inFrame && o.cast.description.trim() ? { [o.heroTag]: o.cast.description } : {})
  return { words: sceneWords(text, { elements, cards, drop, staged: o.heroTag ? [o.heroTag] : [] }) }
}

/** a text as one or more whole sentences: its first letter up, a stop at the end when it has none; no word changed */
export const asWritten = (s: string): string => {
  const t = s.trim().replace(/\s+/g, ' ')
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}` : ''
}
