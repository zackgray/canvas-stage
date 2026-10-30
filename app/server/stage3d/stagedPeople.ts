/**
 * THE definition of "the staged people" of a kit take (recipe step 6), shared by everything that names, judges or fixes a person:
 * the render prompt (l2r/stagedPrompt.ts names only them), the still judge and the face redraw (hero/judge.ts, faceRedraw.ts) and
 * the face pass (l2r/facePeople.ts). Staged = on the clay as a person the scene means: the hero (always; perf.castId's card plays
 * them, null = none picked) and every extra bound to a Bible tag, walking or standing (a cast element's card plays them, else no
 * card). An untagged extra is a crowd figure, never named, judged or fixed. Subjects are the ID pass's entity tags. Pure.
 */
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import type { ExtraPlan } from '../../src/stage3d/contract.ts'

export interface StagedEntry {
  /** the ID pass's entity tag: 'hero' or 'extra:<index>:<variant>' */
  subject: string
  /** the cast card that plays them (null: none picked, or the extra's tag is not a cast element) */
  cardId: string | null
  /** the extra's Bible tag (absent for the hero) */
  tag?: string
  /** the extra's plan (absent for the hero) */
  extra?: ExtraPlan
}

export function stagedPeople(perf: { castId?: string | null; extras?: ExtraPlan[] }, bible: BibleRecord | null): StagedEntry[] {
  const out: StagedEntry[] = [{ subject: 'hero', cardId: perf.castId ?? null }]
  ;(perf.extras ?? []).forEach((x, i) => {
    if (!x.tag) return
    const el = bible?.elements.find((e) => e.tag === x.tag && e.kind === 'cast')
    out.push({ subject: `extra:${i}:${x.variant}`, cardId: el?.cardId ?? null, tag: x.tag, extra: x })
  })
  return out
}
