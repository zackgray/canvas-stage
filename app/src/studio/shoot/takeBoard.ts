// The take list's rows for the world on the set (GET /__lab/takes/board): each take's name, thumbnail, state and words, and the
// scene prompt now. One copy every reader shares (the list and the take's words box), polled while one is mounted, read again at once when a
// take's words or the scene's Bible are written or another take goes on show. Free.
import { useEffect, useSyncExternalStore } from 'react'
import type { TakeBoardResponse } from '../../shared/takeWordsContract'
import { TAKE_WORDS_CHANGED } from '../../shared/takeWordsContract'
import { BIBLE_CHANGED } from '../scene/bibleApi'
import { useCurrentTakeId } from './currentTake'
import { fetchBoard } from './takeWordsApi'

const POLL_MS = 4000
const EMPTY: TakeBoardResponse = { rows: [], scenePrompt: '' }
let world: string | null = null
let board: TakeBoardResponse = EMPTY
let seq = 0
/** the newest read whose answer is on show: an older answer arriving late never replaces it, and a stream of reads never starves it */
let applied = 0
const subs = new Set<() => void>()

export async function refreshBoard(): Promise<void> {
  const w = world, n = ++seq
  if (!w) return
  try {
    const next = await fetchBoard(w)
    if (n <= applied || w !== world) return
    applied = n
    if (JSON.stringify(next) === JSON.stringify(board)) return
    board = next
  } catch { return /* the list is a convenience: it keeps what it showed */ }
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

// one poll and one pair of listeners for every mounted reader (fix 2026-10-30: each reader ran a 4 s poll of its own)
let users = 0
let timer: ReturnType<typeof setInterval> | null = null
const onWrite = () => void refreshBoard()
function join(): () => void {
  if (++users === 1) {
    timer = setInterval(() => void refreshBoard(), POLL_MS)
    window.addEventListener(TAKE_WORDS_CHANGED, onWrite)
    window.addEventListener(BIBLE_CHANGED, onWrite)
  }
  return () => { if (--users === 0) stop() }
}
function stop(): void {
  users = 0
  if (timer) { clearInterval(timer); timer = null }
  if (typeof window !== 'undefined') { window.removeEventListener(TAKE_WORDS_CHANGED, onWrite); window.removeEventListener(BIBLE_CHANGED, onWrite) }
}

/** the world's rows (empty until read, or for no world) */
export function useTakeBoard(worldId: string | null): TakeBoardResponse {
  const b = useSyncExternalStore(subscribe, () => board)
  const cur = useCurrentTakeId()
  useEffect(() => {
    if (world !== worldId) { world = worldId; board = EMPTY; applied = seq; subs.forEach((f) => f()) }
    void refreshBoard()
    if (!worldId) return
    return join()
  }, [worldId])
  useEffect(() => { void refreshBoard() }, [cur])
  return worldId && world === worldId ? b : EMPTY
}

/** tests only */
export function resetTakeBoard(): void { world = null; board = EMPTY; seq++; applied = seq; stop() }
