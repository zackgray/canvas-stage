// "What will be sent" is editable at the Stage's two paid presses (owner 10-29): the first frame's draw (its draw words and its
// finish words) and the render. An edit is the owner's own text, sent exactly as written, and it sticks to the take until Reset, so
// Render again or another draw never undoes it. Each edit keeps the composed words it was made from (`base`): when the take's words
// or a tagged card change the composed words, the edit is older than them, and the press asks Reset / Keep. Only text: no picture,
// first frame or clay input changes with it. Remembered in this browser per take (localStorage), like the press choices.
import { useSyncExternalStore } from 'react'

/** which press: the draw's jobs ('prompt' = the draw words, 'finishPrompt' = the finish words) or the render's one job */
export type SentKey = 'prompt' | 'finishPrompt' | 'render'
export interface SentEdit { text: string; base: string }
export type SentEdits = Partial<Record<SentKey, SentEdit>>

const PREFIX = 'canvas-stage.sent-edit.'
const subs = new Set<() => void>()
const cache = new Map<string, SentEdits>()
const NONE: SentEdits = {}

function read(takeId: string): SentEdits {
  const hit = cache.get(takeId)
  if (hit) return hit
  let v: SentEdits = NONE
  try { const o = JSON.parse(localStorage.getItem(PREFIX + takeId) ?? 'null') as SentEdits | null; if (o && typeof o === 'object') v = o } catch { /* storage off */ }
  cache.set(takeId, v)
  return v
}

function write(takeId: string, next: SentEdits): void {
  cache.set(takeId, next)
  try { if (Object.keys(next).length) localStorage.setItem(PREFIX + takeId, JSON.stringify(next)); else localStorage.removeItem(PREFIX + takeId) } catch { /* this page only */ }
  subs.forEach((f) => f())
}

/** the take's edits as they stand (non-React callers: the presses read them when they send) */
export const sentEditsOf = (takeId: string | null): SentEdits => (takeId ? read(takeId) : NONE)

/** the owner's text for one job; typing it back to the composed words drops the edit */
export function setSentEdit(takeId: string, key: SentKey, text: string, base: string): void {
  const cur = { ...read(takeId) }
  if (text === base) delete cur[key]
  else cur[key] = { text, base: cur[key]?.base ?? base }
  write(takeId, cur)
}
/** Reset: the composed words go again */
export function resetSentEdit(takeId: string, key: SentKey): void {
  const cur = { ...read(takeId) }
  delete cur[key]
  write(takeId, cur)
}
/** Keep: the edit stays, now counted as made from the words as they are */
export function keepSentEdit(takeId: string, key: SentKey, base: string): void {
  const cur = read(takeId)[key]
  if (cur) write(takeId, { ...read(takeId), [key]: { ...cur, base } })
}

/** the edit is older than the composed words now (the take's words or a tagged card changed since it was made) */
export const editOlder = (e: SentEdit | undefined, composed: string | null | undefined): boolean => !!e && typeof composed === 'string' && e.base !== composed

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export function useSentEdits(takeId: string | null): SentEdits {
  return useSyncExternalStore(subscribe, () => sentEditsOf(takeId))
}

/** tests only */
export function resetSentEdits(): void {
  for (const k of [...cache.keys()]) try { localStorage.removeItem(PREFIX + k) } catch { /* none */ }
  cache.clear()
  subs.forEach((f) => f())
}
