/**
 * Server-side inputs of the kit still's Klein finish (prompt wave, 2026-10-25): whether two reference files are the same file (run 1
 * sent the cast's front image as both the face and the gear), and what object a material reference dresses, in the
 * brief's words, for the card's material clause (kleinCard.ts).
 */
import path from 'node:path'
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import { firstClause } from './kitStillPrompt.ts'
import { plainNoun } from './kitWords.ts'
import { shortName } from './shortName.ts'
import type { CardMaterial } from './kleinCard.ts'
import type { MaterialRef } from './kitInputs.ts'
import { briefElement, briefOf, surfaceOf } from './stillBrief.ts'

/**
 * the same file: one path, however written (resolved; case-insensitive on Windows). Not by content: a card or tile is a file the owner
 * picked, and run 1's duplicate was one path sent twice.
 */
export function sameFile(a: string, b: string): boolean {
  const norm = (f: string) => (process.platform === 'win32' ? path.resolve(f).toLowerCase() : path.resolve(f))
  return norm(a) === norm(b)
}

/** the first sentence of a board line, its ending trimmed */
const firstSentence = (s: string) => (s.split(/(?<=[.!?])\s+/)[0] ?? '').replace(/[.\s]+$/, '').trim()

/**
 * The object in image 1 a material reference dresses, and its surface: the brief element's name and materials when the brief has
 * it; else a prop's short name (shortName.ts: "car2" -> "race car", never the raw tag), or a material tile's line up to its list
 * ("One old wooden Langstroth beehive: …" -> the beehive). The card no longer says `detail` (prompt-fix pass: the tile's own words,
 * "a straight on photo of …", were read as what to draw); it is kept for the record.
 */
export function cardMaterial(bible: BibleRecord | null, m: Pick<MaterialRef, 'tag' | 'kind' | 'line'>): CardMaterial {
  const el = briefElement(briefOf(bible), m.tag)
  const line = m.line?.trim() ?? ''
  const object = el?.name?.trim() || (m.kind === 'prop' ? shortName({ tag: m.tag, line }) : firstClause(line).replace(/^one /i, '') || plainNoun(m.tag))
  const detail = surfaceOf(el) || (m.kind === 'prop' ? firstSentence(line) : firstSentence(line.replace(/^[^:;]*[:;]\s*/, '')))
  return { object, detail: detail.toLowerCase() === object.toLowerCase() ? '' : detail }
}
