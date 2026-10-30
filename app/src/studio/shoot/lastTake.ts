// The take last on show (one-prompt, owner 10-29): the last take a lock, a pick or a restore put on show, kept while the current take is
// cleared (filming a new take, a set changed since the lock). A new take starts from its words (takeLock.ts sends it as `wordsFrom`),
// and the Prompt drawer shows those words while there is no take on show (drawerMode.ts). In memory only: with none known, or one no
// longer on the world's list, both fall back to the world's newest take, so the box and the lock always agree.
import { useSyncExternalStore } from 'react'
import type { TakeBoardRow } from '../../shared/takeWordsContract'
import { currentTakeId, onCurrentTake } from './currentTake'

let last: string | null = null
const subs = new Set<() => void>()
onCurrentTake(() => {
  const id = currentTakeId()
  if (!id || id === last) return
  last = id
  subs.forEach((f) => f())
})

export const lastTakeId = (): string | null => last
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useLastTakeId = (): string | null => useSyncExternalStore(subscribe, () => last)

/** the take a new take's words come from: the take last on show if it is on the world's list, else the newest (rows are newest first) */
export const seedRow = (rows: TakeBoardRow[], lastId: string | null): TakeBoardRow | null => rows.find((r) => r.id === lastId) ?? rows[0] ?? null

/** tests only */
export function resetLastTake(): void { last = null }
