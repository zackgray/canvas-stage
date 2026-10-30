/**
 * The take's words changed since its first frame was drawn, and nothing else did (words-on-frame, owner 10-29). The still records a
 * hash of the take's words as its `prompt` key (stillBible.ts, takes/words.ts takeBible), so any edit of the Prompt box after the
 * first frame made it stale and Render refused until a paid redraw, even for motion-only words ("stops beside it"). Now a
 * words-only difference is a choice, not a refusal: redraw the first frame from the new words, or render the new words on this
 * frame (the render records `wordsDiffer`). Any other part that changed (a set change, the cast, the light, the brief) keeps
 * the still stale exactly as before. Pure, shared by the server's guards and the browser.
 */
import { stillBibleDiff, stillBibleWhy } from './stillBible.ts'
import type { BibleRecord } from './bibleContract.ts'

declare module './shotContract.ts' {
  interface HeroStill {
    /** (GET /__lab/hero only, never stored) the take's words changed since this still was drawn, and nothing else did */
    wordsChanged?: boolean
  }
  interface L2RRender {
    /** rendered with the take's words as they are now, on a first frame drawn from earlier words (the owner's choice) */
    wordsDiffer?: boolean
  }
  interface L2RRenderRequest {
    /** render the take's words now on the approved first frame, though it was drawn from earlier words */
    wordsOnFrame?: boolean
  }
}

/** Render's line when only the words moved */
export const WORDS_CHANGED = 'The words changed since this first frame was drawn.'
export const WORDS_CHANGED_WHERE = 'Redraw the first frame from the new words, or render the new words on this frame.'

/** the still's only difference from the take's Bible is the words (a still with no keys is judged by version: never words-only) */
export function wordsOnlyBehind(still: { bibleKeys?: Record<string, string> }, bible: BibleRecord | null): boolean {
  if (!bible || !still.bibleKeys) return false
  const diff = stillBibleDiff(still.bibleKeys, bible)
  return diff.length === 1 && diff[0] === 'prompt'
}

/** why the still is behind for good (a redraw is the only way on), or null; a words-only difference is not a reason here */
export function stillHardWhy(still: { bibleVersion?: number; bibleKeys?: Record<string, string> }, bible: BibleRecord | null): string | null {
  return wordsOnlyBehind(still, bible) ? null : stillBibleWhy(still, bible)
}
