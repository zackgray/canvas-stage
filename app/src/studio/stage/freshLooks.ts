// The paid Stage redraws' NEW cards, kept per set (Fable review, money; QA run 5 minor 7): "What should change?" and the Add
// screen's "+ New …" draws save their pictures on the server, but the cards that point at them lived only in the page, so a
// reload or leaving the Stage lost what was paid for. They are kept in this browser per world and read back when the rail opens
// again. Same shape as the rail's own state; storage that is off keeps them for this page only, as before.
import type { PropParts } from '../../shared/sceneContract'

/** `parts` (prop-edits-hold): a drawn prop's ADVANCED edits at its draw, so reopening it (and its placed prop's card) keeps them */
export interface FreshLook { url: string; name: string; desc: string; parts?: PropParts }
export type FreshLooks = Record<string, FreshLook[]>

const KEY = (worldId: string) => `canvas-stage.stage-fresh.${worldId}`

/** the world's kept NEW cards ({} when none, unreadable, or no world) */
export function readFresh(worldId: string | null): FreshLooks {
  if (!worldId) return {}
  try {
    const v = JSON.parse(localStorage.getItem(KEY(worldId)) ?? 'null') as FreshLooks | null
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

export function writeFresh(worldId: string | null, looks: FreshLooks): void {
  if (!worldId) return
  try { localStorage.setItem(KEY(worldId), JSON.stringify(looks)) } catch { /* storage off: this page only */ }
}
