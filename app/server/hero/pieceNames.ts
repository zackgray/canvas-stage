/**
 * Which set pieces a picture prompt names, and how (debris fix, 2026-10-25). The image model draws what the prompt names, so a
 * piece the owner never asked for must not be named: the planner may scatter set dressing (a pile of planks, barrels) that the
 * clay already carries as depth. The rule: relief (mound, rock) is never named; set dressing (kitWords.ts FILLER_KINDS) is named
 * only when the owner's own words give it (its label, its board tile, or its noun in the scene text / brief); every other piece
 * (the landmark kit kinds, a generated piece made from the owner's props) is named as before. And the cut-at-the-top sentence is
 * said in good English for one piece, several, or a phrase the brief wrote. Pure.
 */
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import type { KitItem } from '../../src/stage3d/contract.ts'
import { FILLER_KINDS, plainNoun, RELIEF_KINDS } from './kitWords.ts'

type Piece = Pick<KitItem, 'kind' | 'pieceTag' | 'label'>

/** every string value under `v` (never a key), so the owner's words can be searched as text */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
  return out
}

/** the owner's own words for the scene: the scene text, the Bible prompt, the board tiles, the brief */
export function ownerText(bible: BibleRecord | null, sentence?: string): string {
  const els = (bible?.elements ?? []).map((e) => `${e.tag} ${(e as { name?: string }).name ?? ''} ${e.line ?? ''}`)
  return [sentence ?? '', bible?.prompt ?? '', ...els, ...strings(bible?.brief)].join(' \n ').replace(/[_-]+/g, ' ')
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** the owner's text names this kind ("crates" answers to "a crate"; "weaponRack" to "weapon rack") */
export function ownerNames(kind: string, text: string): boolean {
  const stem = plainNoun(kind).replace(/s$/, '')
  return !!stem && new RegExp(`\\b${escape(stem).replace(/ /g, '\\s+')}(s|es)?\\b`, 'i').test(text)
}

/** whether a piece is named in the picture prompt at all (relief never; set dressing only from the owner's words) */
export function isNamed(k: Piece, hasBoardTile: boolean, text: string): boolean {
  if (RELIEF_KINDS.has(k.kind)) return false
  if (!FILLER_KINDS.has(k.kind)) return true
  return !!k.label?.trim() || hasBoardTile || !!k.pieceTag?.startsWith('prop:') || ownerNames(k.kind, text)
}

const MASS = /(debris|foliage|hay|straw|grass|brush|scrub|rubble|timber|wood|undergrowth|ivy)$/i

/** a plain noun for several of the same piece ("tree" x3 -> "trees"); a noun already plural or a mass noun stays */
export function pluralNoun(noun: string): string {
  if (/s$/i.test(noun) || MASS.test(noun)) return noun
  if (/(x|ch|sh)$/i.test(noun)) return `${noun}es`
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`
  return `${noun}s`
}

/** a named piece's phrase is plural: "apple trees heavy with fruit", "trees"; not "a box", "palisade", "debris", "moss" */
export function isPluralPhrase(name: string): boolean {
  if (/^(a|an|one|the single)\s/i.test(name)) return false
  const head = name.split(/,|\s(?:with|of|in|on|at|from|by|under|heavy|covered|full|laden|that|which)\b/i)[0].trim().replace(/^the\s+/i, '')
  const last = head.split(/\s+/).pop() ?? ''
  return /s$/i.test(last) && !/(ss|us|is)$/i.test(last)
}

/** "The top of the tree runs out of …" / "The tops of the trees and a box run out of …"; '' when nothing is cut */
export function cutSentence(names: string[]): string {
  if (!names.length) return ''
  const bare = (n: string) => !/^(a|an|one|the|this|that|these|those|his|her|their)\s/i.test(n)
  const one = (n: string) => {
    const plural = isPluralPhrase(n)
    // a bare plain noun takes "the" ("the tree"); a phrase the brief wrote keeps its own words ("apple trees heavy with fruit");
    // a label that is no noun ("car2", a digit in it) is said as it is (the one tag rule, src/shared/tagWords.ts)
    const np = bare(n) && !/\d/.test(n) && (!/\s/.test(n) || (!plural && n.split(/\s+/).length <= 2)) ? `the ${n}` : n
    return `${plural ? 'the tops' : 'the top'} of ${np}`
  }
  const parts = names.map(one)
  const many = names.length > 1 || isPluralPhrase(names[0])
  const said = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return `${said.charAt(0).toUpperCase()}${said.slice(1)} ${many ? 'run' : 'runs'} out of the picture at the top edge.`
}
