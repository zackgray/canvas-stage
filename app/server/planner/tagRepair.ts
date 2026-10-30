/**
 * Free repairs of a Develop answer's @tags before the gate (prompt wave 2026-10-25, run 1): Gemma wrote two-word nouns as
 * `@honeycomb frame` / `@wooden hive` while its elements said `honeycomb_frame` / `wooden_hive`; the gate refused both tries
 * ("@honeycomb has no element"), 4.7 cr billed, nothing kept. Only a mention that would fail is touched: a mention whose word alone
 * is already an element tag is never rewritten. Pure.
 */

/** the tag rule in words, quoted by the gate's errors so the retry message names it */
export const TAG_RULE = 'a tag is ONE lower-case word, with _ joining words (a "honeycomb frame" is @honeycomb_frame)'

const MAX_EXTRA_WORDS = 3
const norm = (s: string) => s.toLowerCase().replace(/-/g, '_')

/** an element tag as the model wrote it, made one token: "@Wooden Hive" -> "wooden_hive"; a tag that is fine is returned unchanged */
export function slugTag(raw: string): string {
  const t = raw.trim().replace(/^@/, '')
  if (!/[\sA-Z]/.test(t)) return t
  return t.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').replace(/_{2,}/g, '_')
}

/**
 * The text with every split or mis-joined mention rewritten to the element tag it means:
 * `@honeycomb frame` -> `@honeycomb_frame` when `honeycomb_frame` (or `honeycomb-frame`) is a tag and `honeycomb` is not;
 * `@wooden-hive` -> `@wooden_hive` when only the `_` spelling is a tag. Longest match first (up to 3 following words).
 */
export function repairMentions(text: string, tags: readonly string[]): string {
  if (!text.includes('@') || !tags.length) return text
  const has = new Set(tags)
  const byNorm = new Map(tags.map((t) => [norm(t), t]))
  const re = new RegExp(`(?<![A-Za-z0-9_])@([A-Za-z][A-Za-z0-9_-]*)((?:[ \\t-]+[A-Za-z][A-Za-z0-9]*){0,${MAX_EXTRA_WORDS}})`, 'g')
  return text.replace(re, (whole, head: string, rest: string) => {
    const first = head.toLowerCase()
    if (has.has(head)) return whole
    const words = rest.split(/[ \t-]+/).filter(Boolean)
    for (let n = words.length; n >= 0; n--) {
      const t = byNorm.get(norm([first, ...words.slice(0, n)].join('_')))
      if (!t) continue
      // what came after the joined words is left exactly as written
      let tail = rest
      for (let i = 0; i < n; i++) tail = tail.replace(/^[ \t-]+[A-Za-z][A-Za-z0-9]*/, '')
      return `@${t}${tail}`
    }
    return whole
  })
}
