// The quiet lines under a words box (tag-from-pasted-prompt, take-list-loose-ends). Free and local; they only tell.
import { unknownNote } from './wordsTags'

/** the one-line @ hint: only while the words hold no tags (the scene drawer and the take's own words box) */
export function NoTagHint({ brief }: { brief: string }) {
  if (/@\w/.test(brief)) return null
  return <p className="st-cam-note" data-testid="no-tag-hint">Type @ to tag a person or a prop from your scene.</p>
}

/** words that name tags this scene lacks (copied from another scene): said before any press, not only as a refusal later */
export function UnknownTagsNote({ tags }: { tags: readonly string[] }) {
  if (!tags.length) return null
  return <p className="st-warn st-cam-note" role="status" data-testid="unknown-tags-note">{unknownNote(tags)}</p>
}
