// Pure helpers for the Scene screen: tags, prompt insertion, prices. No DOM, no fetch.
import type { CardPayload, Ingredient } from '../../project/model'
import { isTag, promptTags, QWEN_DEPTH_CR, type BibleElement, type BibleRecord, type ElementKind } from '../../shared/bibleContract'

/** Qwen-Image 2512 at 50 steps, one master candidate (plan §3.6) */
export const MASTER_CR_EACH = QWEN_DEPTH_CR
/** seeds per "Draw master" job (BibleMasterRequest.count, 1..2) */
export const MASTER_SEEDS = 2
export const masterCredits = (count = MASTER_SEEDS) => count * MASTER_CR_EACH


export const KIND_LABEL: Record<ElementKind, string> = {
  cast: 'Cast', creature: 'Creature', extras: 'Extras sheet', prop: 'Prop', material: 'Material ref',
}

/** A tag is what BIBLE_TAG_RE accepts: a lower-case word starting with a letter, 32 characters at most. */
export { isTag }

/** A default tag from a name ("Rosa Klee" -> "rosa_klee"), made unique against `taken` with -2, -3… */
export function tagFrom(name: string, taken: readonly string[] = []): string {
  let base = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '_').replace(/^[^a-z]+/, '').replace(/_+$/, '').slice(0, 28)
  if (!base) base = 'ref'
  if (!taken.includes(base)) return base
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`
}

/** The prompt with `@tag` added at the end, unless it already mentions it. Tags are inserted, never parsed into being. */
export function insertTag(prompt: string, tag: string): string {
  if (promptTags(prompt).includes(tag)) return prompt
  const t = prompt.trimEnd()
  return t ? `${t} @${tag}` : `@${tag}`
}

/** The tags a prompt mentions, each marked known (a reference tile) or unknown (flagged, never sent). */
export function tagChips(prompt: string, elements: readonly BibleElement[]): { tag: string; known: boolean }[] {
  return promptTags(prompt).map((tag) => ({ tag, known: elements.some((e) => e.tag === tag) }))
}

/** True when the screen's drafts differ from the saved Bible (an empty Bible reads as '' everywhere). */
export function textDirty(b: Pick<BibleRecord, 'prompt' | 'lighting' | 'materials'> | null, d: { prompt: string; lighting: string; materials: string }) {
  return (b?.prompt ?? '') !== d.prompt || (b?.lighting ?? '') !== d.lighting || (b?.materials ?? '') !== d.materials
}

/** a Cast card's tile kind */
export type CastKind = 'cast' | 'creature'

/** A Cast card as a reference tile: its tag from its name, its front view as the image, its description as the line. */
export function elementOf(card: Ingredient<CardPayload>, kind: CastKind, taken: readonly string[]): BibleElement {
  const p = card.versions.at(-1)?.payload
  return { tag: tagFrom(card.name, taken), kind, cardId: card.id, refs: p?.sheets.slice(0, 1) ?? [], line: p?.description ?? '' }
}

