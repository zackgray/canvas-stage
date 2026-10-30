// Who plays whom in Blocking: the world's Bible read once (GET only, track A1's route) and turned into the pickers' options.
// A missing Bible, or the route not built yet (A1's 501 stub), is "no Bible": the pickers say so and nothing is guessed.
import { BIBLE_ROUTES, type BibleRecord, type ElementKind } from '../../../../shared/bibleContract'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** the world's Bible, or null when it has none or the route does not answer one */
export async function readBible(worldId: string, f: Fetch = fetch): Promise<BibleRecord | null> {
  const res = await f(`${BIBLE_ROUTES.bible}?world=${encodeURIComponent(worldId)}`, { cache: 'no-store' })
  if (!res.ok) return null
  const b = (await res.json().catch(() => null)) as { bible?: BibleRecord | null } | null
  return b?.bible ?? null
}

export interface TagOption { tag: string; cardId?: string; label: string }

/** the Bible's elements of one kind as picker options ('@tag'); cast options only when they point at a card */
export function tagOptions(bible: BibleRecord | null, kind: ElementKind): TagOption[] {
  return (bible?.elements ?? []).filter((e) => e.kind === kind && (kind !== 'cast' || !!e.cardId))
    .map((e) => ({ tag: e.tag, ...(e.cardId ? { cardId: e.cardId } : {}), label: `@${e.tag}` }))
}

/** how many variants the extras sheet holds (4 placeholder variants until the Bible has a sheet) */
export const extrasVariants = (bible: BibleRecord | null): number => bible?.extrasSheet?.variants ?? 4
