/**
 * `composePrompt` (bibleContract ComposePrompt): the one place a Bible becomes prompt text, for drawn stills and for the
 * Render (video) prompt. Order: lighting line, materials line, the scene prompt (or the kit plan's sentence while the Bible
 * has none), each tagged non-cast element's line, the take's action line, then the background action line (S2: people and
 * motion far behind, never set geometry; for both targets, E131 showed the far crowd holds from the words alone). A tag is replaced where it is written:
 *   - cast tag: still -> "the person from image N" (the slot it was sent in); video -> the Cast card's description;
 *   - any other tag -> its plain word ("dragon"), with the element's `line` appended once, in order of first mention.
 * The camera is never in the text. A `@token` matching no element is unknown: it is reported, and `text` is then EMPTY so an
 * unknown tag can never be sent (callers refuse with `unknownTagMessage`, or use `composeOrThrow`).
 * For STILL prompts: the Bible's own words only, no counts, lengths or extra objects added here (Qwen draws what a prompt
 * names; Wave 0 saw it invent a long palisade), so the background claims are exactly what the owner wrote in the scene prompt.
 */
import { BIBLE_TAG_RE, type BibleElement, type BibleRecord, type ComposeInput, type ComposePrompt, type ComposedPrompt } from '../../src/shared/bibleContract.ts'

const sentence = (s: string | null | undefined) => {
  const t = (s ?? '').trim()
  return t && !/[.!?]$/.test(t) ? `${t}.` : t
}

/** The Bible's lighting sentence ('' = none). */
export const lightingLine = (b: BibleRecord | null) => sentence(b?.lighting)
/** The Bible's materials sentence ('' = none). */
export const materialsLine = (b: BibleRecord | null) => sentence(b?.materials)
/** The Bible's background action sentence ('' = none): people and motion far behind (E131), allowed in stills too (E130). */
export const backgroundLine = (b: BibleRecord | null) => { const s = sentence(b?.background); return s.charAt(0).toUpperCase() + s.slice(1) }

export function unknownTagMessage(unknown: string[]): string {
  const list = unknown.map((t) => `@${t}`).join(', ')
  return `${list} ${unknown.length === 1 ? 'matches' : 'match'} no reference tile in the scene sheet. Pick the tag from the reference list or remove it.`
}

export class UnknownTagError extends Error {
  readonly unknown: string[]
  constructor(unknown: string[]) { super(unknownTagMessage(unknown)); this.unknown = unknown }
}

export const composePrompt: ComposePrompt = (input: ComposeInput): ComposedPrompt => {
  const { bible, target } = input
  const byTag = new Map<string, BibleElement>((bible?.elements ?? []).map((e) => [e.tag, e]))
  const tags: string[] = []
  const unknown: string[] = []
  const lines: string[] = []

  const expand = (src: string): string =>
    src.replace(BIBLE_TAG_RE, (_m, tag: string) => {
      const el = byTag.get(tag)
      if (!el) { if (!unknown.includes(tag)) unknown.push(tag); return '' }
      if (!tags.includes(tag)) tags.push(tag)
      if (el.kind === 'cast') {
        const slot = input.imageSlots?.[tag]
        const desc = el.cardId ? input.castDescriptions?.[el.cardId]?.trim() : undefined
        if (target === 'still' && slot !== undefined) return `the person from image ${slot}`
        if (target === 'video' && desc) return desc.replace(/[.!?]+$/, '')
        const l = sentence(el.line)
        if (l && !lines.includes(l)) lines.push(l)
        return 'the person'
      }
      const l = sentence(el.line)
      if (l && !lines.includes(l)) lines.push(l)
      return tag.replace(/[_-]+/g, ' ')
    })

  const scene = bible?.prompt.trim() ? bible.prompt : input.fallback
  const sceneText = sentence(expand(scene ?? '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;!?])/g, '$1'))
  const actionText = sentence(expand(input.action ?? '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;!?])/g, '$1'))
  if (unknown.length) return { text: '', tags, unknown }

  const parts = [lightingLine(bible), materialsLine(bible), sceneText, ...lines, actionText, backgroundLine(bible)].filter(Boolean)
  return { text: parts.join(' '), tags, unknown }
}

/** composePrompt for callers that refuse instead of branching: throws UnknownTagError naming the offending tags. */
export function composeOrThrow(input: ComposeInput): ComposedPrompt {
  const out = composePrompt(input)
  if (out.unknown.length) throw new UnknownTagError(out.unknown)
  return out
}
