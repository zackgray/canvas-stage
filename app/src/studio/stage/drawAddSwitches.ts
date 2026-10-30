// "Added by the app" (prompt-fix pass, 2026-10-30): the draw words the app adds to the user's own (the rest of the person's card, the
// pieces in view and the cut top) each have a switch at the Stage's draw press, per take, remembered in this browser like the sent
// edits (sentEdits.ts). On is today's behaviour and is never sent; only a switch turned off travels, as the request's `drawAdds`
// (server/hero/drawAdds.ts), and the server then leaves those words out. Only text changes: no picture or clay input.
import { useSyncExternalStore } from 'react'
import type { DrawAddKey } from '../../shared/stillPressContract'

export type DrawAddSwitches = Partial<Record<DrawAddKey, false>>

const PREFIX = 'canvas-stage.draw-adds.'
const subs = new Set<() => void>()
const cache = new Map<string, DrawAddSwitches>()
const NONE: DrawAddSwitches = {}

function read(takeId: string): DrawAddSwitches {
  const hit = cache.get(takeId)
  if (hit) return hit
  let v: DrawAddSwitches = NONE
  try { const o = JSON.parse(localStorage.getItem(PREFIX + takeId) ?? 'null') as DrawAddSwitches | null; if (o && typeof o === 'object') v = o } catch { /* storage off */ }
  cache.set(takeId, v)
  return v
}

/** turn one addition on (the default, forgotten) or off (remembered for the take) */
export function setDrawAdd(takeId: string, key: DrawAddKey, on: boolean): void {
  const next: DrawAddSwitches = { ...read(takeId) }
  if (on) delete next[key]
  else next[key] = false
  cache.set(takeId, next)
  try { if (Object.keys(next).length) localStorage.setItem(PREFIX + takeId, JSON.stringify(next)); else localStorage.removeItem(PREFIX + takeId) } catch { /* this page only */ }
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
/** the take's switches turned off; {} = every addition on */
export function useDrawAdds(takeId: string | null): DrawAddSwitches {
  return useSyncExternalStore(subscribe, () => (takeId ? read(takeId) : NONE))
}

/** the request field: absent while every addition is on */
export const drawAddsField = (s: DrawAddSwitches): { drawAdds?: DrawAddSwitches } => (Object.keys(s).length ? { drawAdds: s } : {})

/** tests only */
export function resetDrawAdds(): void {
  for (const k of [...cache.keys()]) try { localStorage.removeItem(PREFIX + k) } catch { /* none */ }
  cache.clear()
  subs.forEach((f) => f())
}
