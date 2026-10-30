/**
 * Each take owns its words (coverage + per-shot-prompts, owner 10-28 PM): a take locked from now on starts with a COPY of the words of
 * the take before it (TakeLockWords: the take last on show, else the world's newest take; one-prompt, owner 10-29), and the first take
 * of a world with a COPY of the scene prompt (the Bible's `prompt`, @tags kept: the words typed before any take, never shown by that
 * name); edited on its own; "Start from…" copies another take's or another scene's words in (a copy, never a link); a later scene
 * prompt never rewrites a take (`sceneChanged` and "Update from scene" stay in the routes; the page no longer offers them). The draw,
 * the render and their stale guards read the take's words in place of the scene prompt (takeBible), so a changed take prompt stales a
 * still exactly as a drawer change does. A take locked before takes had words (no `prompt`) simply reads the scene prompt. Fields only
 * added (interface merging); pure, so the server and the page share it.
 */
import type { BibleRecord } from './bibleContract.ts'
import type { TakeRecord } from './shotContract.ts'

declare module './shotContract.ts' {
  interface TakeRecord {
    /** the owner's name for the take; absent = the id's display name */
    name?: string
    /** the take's own scene words (the Bible prompt's form); absent = the scene prompt */
    prompt?: string
    /** the scene prompt as it was when `prompt` was copied from it or set beside it: another scene prompt now = "scene prompt changed" */
    sceneBase?: string
  }
}

export const TAKE_NAME_MAX = 60
/** the Bible's own cap on the scene prompt (buildCheck.ts BIBLE_LIMITS.prompt) */
export const TAKE_WORDS_MAX = 4000
/** fired on the page when a take's words were written: the still list and Render read their staleness again */
export const TAKE_WORDS_CHANGED = 'canvas-stage:take-words-changed'

/** the Bible the take's draw and render read: the scene's, with the take's own words as its prompt (null stays null) */
export function takeBibleOf(bible: BibleRecord | null, take: Pick<TakeRecord, 'prompt'>): BibleRecord | null {
  return bible && typeof take.prompt === 'string' ? { ...bible, prompt: take.prompt } : bible
}

/** the words a take draws from: its own, else the scene prompt */
export const takeWords = (take: Pick<TakeRecord, 'prompt'>, bible: Pick<BibleRecord, 'prompt'> | null): string => take.prompt ?? bible?.prompt ?? ''

/** the scene prompt moved on since the take's words were copied from it (a take with no words of its own follows it, so never) */
export const sceneMoved = (take: Pick<TakeRecord, 'prompt' | 'sceneBase'>, bible: Pick<BibleRecord, 'prompt'> | null): boolean =>
  typeof take.prompt === 'string' && !!bible && (take.sceneBase ?? '') !== bible.prompt

/** where a take is: locked (no approved first frame yet), drawn (an approved first frame), rendered (a finished render) */
export type TakeState = 'locked' | 'drawn' | 'rendered'

/**
 * Rides beside a TakeLockRequest (POST /__lab/takes/lock; not part of the take's identity): the take whose words a NEW take starts
 * from. Unknown, of another world or absent = the world's newest take; no take in the world = the scene prompt.
 */
export interface TakeLockWords { wordsFrom?: string }

/** GET /__lab/takes/board?world= : the take list's rows for one world, newest lock first */
export interface TakeBoardRow {
  id: string
  name: string | null
  /** the approved first frame's picture (public URL), null = none */
  thumb: string | null
  state: TakeState
  /** the words its draw reads now (its own, else the scene prompt) */
  words: string
  /** true = the take has words of its own */
  own: boolean
  sceneChanged: boolean
}
export interface TakeBoardResponse { rows: TakeBoardRow[]; scenePrompt: string }

/** GET /__lab/takes/sources : words a take may start from (every other take, every other scene with a scene prompt) */
export interface WordsSource {
  kind: 'take' | 'scene'
  /** the take's id, or the scene's */
  id: string
  /** the take's own name (null = the page says its id's), or the scene's name */
  name: string | null
  /** the scene the take was shot in (null = none found, or a scene row) */
  scene: string | null
  words: string
}
export interface WordsSourcesResponse { sources: WordsSource[] }

/**
 * POST /__lab/takes/words: `prompt` = the take's words now (typed: the scene base stays; `rebase`: a Start from… copy, the scene base
 * becomes the scene prompt now); `fromScene` = Update from scene (the scene prompt copied in). -> { take }
 */
export interface TakeWordsRequest { takeId: string; prompt?: string; rebase?: boolean; fromScene?: boolean }
/** POST /__lab/takes/rename {takeId, name} ('' = back to the id's name) -> { take } */
export interface TakeRenameRequest { takeId: string; name: string }
