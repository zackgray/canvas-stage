/**
 * The words a paid render's prompt must never carry, in ONE place for every route that builds or forwards one (the hero still,
 * the Layout-To-Render pass). Two rules from the method review:
 *  - no fire in any form (fire, flames, burning, embers, torches, sparks, smoulder, inferno): Klein draws a named fire into
 *    the frame even "out of shot", and L2R paints it onto the clay's blobs. The still carries the fire, never the words.
 *  - no film-grain words: grain is added once, in the free finish.
 * Changing a rule (say, allowing fire words for hero stills) is an edit here and nowhere else. (Prompt wave, 2026-10-25: the still's
 * film-stock exception went with the stock itself; no app-filled prompt names a stock unless the brief's `style` does: that text is
 * the one place a stock may come from, so it is scrubbed of fire words only.)
 */
const FIRE = String.raw`\w*fire\w*|flam(?:e|es|ed|ing|mable)|burn(?:s|ed|ing|t)?|blaz(?:e|es|ed|ing)|ablaze|embers?|torch\w*|smoulder\w*|smolder\w*|inferno\w*|sparks?`
export const GRAIN_WORDS = String.raw`grain\w*|kodak|vision3|500t|film stock|35 ?mm film|filmic noise|noisy`

/** any banned word (whole words: "December", "sideburns" and "flamingo" are kept) */
export const BANNED = new RegExp(String.raw`\b(${FIRE}|${GRAIN_WORDS})\b`, 'i')
/** the grain words alone (a fire-plan kit prompt may carry fire words but never these) */
export const GRAIN = new RegExp(String.raw`\b(${GRAIN_WORDS})\b`, 'i')
/** the fire words alone: all the brief's `style` is scrubbed of (a stock or grain word there is the owner's own choice) */
export const FIRE_ONLY = new RegExp(String.raw`\b(${FIRE})\b`, 'i')

/** the banned words in `text`, lower-cased, each once (for a refusal that names them) */
export function bannedIn(text: string): string[] {
  const all = text.match(new RegExp(BANNED.source, 'gi')) ?? []
  return [...new Set(all.map((w) => w.toLowerCase()))]
}
