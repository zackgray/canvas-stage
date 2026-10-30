// The "Draw this frame" recipe, one per locked take, shared by every mounted hero-still block (Fable review, money): the keyframe
// picked, the close-pass mid frame, the press preview's choices (lock, refs, edited prompt) and the plain-take prompt. The Stage
// mounts the block twice (The first frame card, and a no-UI copy that keeps the draw bar's press alive); when they each kept their
// own state, closing the card remounted the bare copy fresh and the bar's press drew an OPENING still from the recipe prompt after
// the owner had picked Mid or edited the prompt, at the same price. One store, remembered for the browser session like the still
// count (stillCount.ts); another take starts from the defaults.
import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { KeyframeRole } from '../../shared/shotContract'
import { FIRST_CHOICE, type PressChoice } from './useStillPreview'

export interface StillRecipe {
  role: KeyframeRole
  prompt: string
  choice: PressChoice
  midPick: { takeId: string; frame: number } | null
}
type Stored = StillRecipe & { takeId: string | null }

const KEY = 'canvas-stage.still-recipe'
export const DEFAULT_RECIPE: StillRecipe = { role: 'opening', prompt: '', choice: FIRST_CHOICE, midPick: null }

const listeners = new Set<() => void>()
let current: Stored = read()

function read(): Stored {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Stored | null
    if (v && typeof v === 'object' && typeof v.role === 'string' && v.choice) return v
  } catch { /* storage off or unreadable: the defaults */ }
  return { takeId: null, ...DEFAULT_RECIPE }
}

function write(next: Stored): void {
  current = next
  try { sessionStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage off: this page only */ }
  for (const l of listeners) l()
}

/** tests: back to the defaults (and nothing in the session) */
export function resetStillRecipe(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* storage off */ }
  write({ takeId: null, ...DEFAULT_RECIPE })
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const snapshot = () => current

/** the take's recipe and its stable setters (every mounted block sees the same one) */
export function useStillRecipe(takeId: string | null) {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot)
  const take = useRef(takeId)
  take.current = takeId // the setters write to the take on show now
  const mine: StillRecipe = s.takeId === takeId ? s : DEFAULT_RECIPE
  const update = useCallback((f: (r: StillRecipe) => Partial<StillRecipe>) => {
    const base: StillRecipe = current.takeId === take.current ? current : DEFAULT_RECIPE
    write({ ...base, ...f(base), takeId: take.current })
  }, [])
  const setters = useRef({
    setRole: (role: KeyframeRole) => update(() => ({ role })),
    setChoice: (c: PressChoice | ((c: PressChoice) => PressChoice)) => update((r) => ({ choice: typeof c === 'function' ? c(r.choice) : c })),
    setMidPick: (midPick: StillRecipe['midPick']) => update(() => ({ midPick })),
  })
  return { ...mine, ...setters.current }
}
