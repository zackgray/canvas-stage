// The open take (owner 10-29: "New take duplicates what's up, then I'm free to move that, and can toggle back"): the scene's own
// walk and set, being set up for the next take, as one row in the Stage's take list. It opens when New take copies the take on show
// into the scene, or when the scene's setup comes on show by an edit or Record (takeShow.ts setTakeAside); it stays, through picks of
// locked takes and a reload, until a take is locked on the world or the owner discards it. Remembered per world in this browser,
// like the take pick (takePick.ts). Pure store, no imports from the take state.
import { useSyncExternalStore } from 'react'

const KEY = 'canvas-stage.open-take'
const open = new Set<string>()
const subs = new Set<() => void>()
let version = 0

const read = (worldId: string): boolean => {
  try { return localStorage.getItem(`${KEY}.${worldId}`) === '1' } catch { return false }
}

/** the world has an open take (its row shows in the take list) */
export const openTakeOn = (worldId: string | null | undefined): boolean => !!worldId && (open.has(worldId) || read(worldId))

export function setOpenTake(worldId: string, on: boolean): void {
  if (openTakeOn(worldId) === on) return
  if (on) open.add(worldId); else open.delete(worldId)
  try { if (on) localStorage.setItem(`${KEY}.${worldId}`, '1'); else localStorage.removeItem(`${KEY}.${worldId}`) } catch { /* storage off: this page only */ }
  version++
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
/** re-renders when the open take of any world opens or closes */
export const useOpenTake = (worldId: string | null | undefined): boolean => {
  useSyncExternalStore(subscribe, () => version)
  return openTakeOn(worldId)
}

/** tests only */
export function resetOpenTake(): void {
  for (const w of open) { try { localStorage.removeItem(`${KEY}.${w}`) } catch { /* */ } }
  open.clear(); version++
}
