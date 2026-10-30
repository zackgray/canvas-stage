/**
 * A set piece's short name, for the words the app adds (prompt-fix pass, 2026-10-30: "In the frame: car2" and "The car2 in image 1 has
 * the surface of image 3" sent a raw tag to both models). A label that is a plain word stands ("grandstand"); a label or tag that is a
 * label rather than a word ("car2", "steam_train") is said by its word ("car", "steam train"), with the word before it when the board
 * line names it so ("An open-wheel single-seater race car with …" -> "race car"). Never a digit or an underscore. Pure.
 */
import { plainNoun } from './kitWords.ts'

/** a label that reads as words: anything but one bare token with a digit or underscore in it ("car2", "steam_train"); a label
 *  of several words keeps its own ("K2 van", "a hive, 1.2 m tall": the sizes are the caller's to strip) */
const isWords = (s: string) => !!s.trim() && !/^[\w-]*[\d_][\w-]*$/.test(s.trim())
/** a tag's own word: "car2" -> "car", "steam_train" -> "steam train", "weaponRack" -> "weapon rack" */
export const tagWord = (tag: string): string => plainNoun(tag.replace(/^prop:/, '')).replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim()

/** the board line's head phrase: its article and any "photo of" opener off, cut before its first comma or "with …" */
function headOf(line: string): string {
  return line.trim()
    .replace(/^(?:a|an|the|one)\s+/i, '')
    .replace(/^.*?\b(?:photo|photograph|picture|image|shot|render|view|drawing)\s+of\s+(?:(?:a|an|the|one)\s+)?/i, '')
    .split(/\s*[,;:.]\s*|\s+(?:with|in|on|at|by|from|that|which|under|near)\s+/i)[0].trim()
}

/**
 * The short name of a piece: its label when that is a plain word; else its tag's word, joined (a one-word tag only) by the word before
 * it in the board line's head phrase when the head ends with it ("race car"); '' only when there is nothing at all.
 */
export function shortName(o: { label?: string; tag?: string; kind?: string; line?: string }): string {
  const label = o.label?.trim() ?? ''
  if (isWords(label)) return label
  const word = tagWord(o.tag || label || o.kind || '')
  const head = headOf(o.line ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (word && !word.includes(' ') && head.length > 1 && head[head.length - 1] === word) {
    const before = head[head.length - 2]
    if (before && /^[a-z]+$/.test(before)) return `${before} ${word}`
  }
  return word || head.slice(-2).join(' ')
}
