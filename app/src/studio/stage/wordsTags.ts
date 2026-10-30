// The words box's tag helpers (tag-from-pasted-prompt, take-list-loose-ends): pure and free. Which tags the words name that the
// scene lacks (words copied from another scene), and a selected run of words turned into an @tag ("Make this a character / prop").
import { briefTags } from '../scene/design/briefText'
import { cap, slug, uniqTag } from '../scene/design/model'

/** the longest run of words the pop-up offers to tag (a name or a short noun phrase, never a sentence) */
export const SELECT_MAX = 40
const ARTICLE = /^(?:an?|the)\s+/i

/** the tags the words name that the scene does not answer to, in order of first mention */
export const unknownTags = (words: string, known: Iterable<string>): string[] => {
  const have = new Set(known)
  return briefTags(words).filter((t) => !have.has(t))
}

/** the plain-words line for tags the scene lacks, said before any press */
export function unknownNote(tags: readonly string[]): string {
  const list = tags.map((t) => `@${t}`).join(', ')
  return `${list} ${tags.length > 1 ? 'are' : 'is'} not in this scene, so a draw from these words would be refused. Type @ to pick one that is here, or take ${tags.length > 1 ? 'them' : 'it'} out.`
}

export interface TagFromSelection { text: string; tag: string; name: string; caret: number }

/**
 * The words with the selected run replaced by an @tag, or null when the selection is not a thing to tag (empty, a sentence, a line
 * break, or already part of a tag). A leading "a / the" stays outside the tag: "the old keeper" becomes "the @old-keeper".
 */
export function tagFromSelection(text: string, start: number, end: number, taken: readonly string[]): TagFromSelection | null {
  let from = Math.min(start, end), to = Math.max(start, end)
  while (from < to && /\s/.test(text[from])) from++
  while (to > from && /\s/.test(text[to - 1])) to--
  const art = ARTICLE.exec(text.slice(from, to))
  if (art) from += art[0].length
  const picked = text.slice(from, to)
  if (!picked || picked.length > SELECT_MAX || /[@\n]/.test(picked) || /@[\w-]*$/.test(text.slice(0, from))) return null
  if (!/[A-Za-z]/.test(picked)) return null
  const tag = uniqTag(slug(picked), taken)
  // the caret lands past the tag (a tag at the very end gets its space), so the @ pick-list does not open on the tag just made
  const put = to === text.length ? `@${tag} ` : `@${tag}`
  return { text: text.slice(0, from) + put + text.slice(to), tag, name: cap(picked.trim()), caret: from + put.length + (to < text.length ? 1 : 0) }
}
