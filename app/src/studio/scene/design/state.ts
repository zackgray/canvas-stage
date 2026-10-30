// The Scene design's state shape, its defaults and its persistence. It exists before there is a world, so before there is a
// Bible: it is kept locally (instantly) and as the project's draft on the server (useDesign, debounced), and the Bible receives
// it when the set is built. Pure apart from localStorage.
import type { SceneBriefV2 } from '../../../shared/briefContract'
import type { ConceptQuality } from '../../../shared/sceneContract'
import { freshGuided, type Guided } from './guided'
import type { Piece } from './model'

// ('set' was the Set & master screen, retired: a scene saved on it opens on the Board)
export type Screen = 'guided' | 'board'
export type PanelId = 'brief' | 'details'

export interface Design {
  screen: Screen
  route: 'guided' | null
  /** the scene brief, @tags inline */
  brief: string
  /** the brief was edited by hand since it was composed */
  edited: boolean
  /** the structured v2 brief (null/absent = none: an older scene); saved to the Bible with the flat lines */
  v2?: SceneBriefV2 | null
  /** the v2 brief was replaced as a whole (Guided, Undo) since the world's Bible last got it: useV2Save writes it there (null
   *  clears it) once a world exists, then clears this */
  v2Stale?: boolean
  lighting: string
  materials: string
  /** the Bible's background action line */
  action: string
  pieces: Piece[]
  phase: 'empty' | 'generating' | 'board'
  /** the piece open for editing (a dialog over the board), null = none */
  sel: string | null
  labels: boolean
  /** the stacked panels' open state, remembered per panel */
  panels: Record<PanelId, boolean>
  /** credits this design has asked for (estimates) */
  spent: number
  /** concept draws: 'full' Qwen-Image 2512, or the 'draft' Lightning 4-step at about a fifth of the price */
  quality: ConceptQuality
  guided: Guided | null
}

export const freshDesign = (): Design => ({
  screen: 'guided', route: null, brief: '', edited: false, v2: null,
  lighting: '', materials: '', action: '', pieces: [], phase: 'empty', sel: null, labels: true,
  panels: { brief: true, details: true }, spent: 0, quality: 'full', guided: freshGuided(),
})

const KEY = 'canvas-stage.scene.design.v1'
/** each scene's design under its own key (m11: a new scene never shows the last one's board); null = no scene (tests) */
export const designKey = (scene?: string | null) => (scene ? `${KEY}.${scene}` : KEY)

/** a saved design (local or the server's draft) as a live one: a draw cut off by a reload is not running any more */
export function reviveDesign(saved: Partial<Design>): Design {
  // saved scenes may carry the removed board views ('view', 'boardOnly'): they are dropped, never revived
  const { view: _view, boardOnly: _boardOnly, ...rest } = saved as Partial<Design> & { view?: unknown; boardOnly?: unknown }
  const d = { ...freshDesign(), ...rest }
  return { ...d, screen: (d.screen as string) === 'board' || (d.screen as string) === 'set' ? 'board' : 'guided',
    phase: d.phase === 'generating' ? 'board' : d.phase, pieces: d.pieces.map((p) => ({ ...p, loading: false })),
    guided: d.guided ? { ...d.guided, cast: d.guided.cast.map((c) => ({ ...c, busy: false })), props: (d.guided.props ?? []).map((c) => ({ ...c, busy: false })),
      st: Object.fromEntries(Object.entries(d.guided.st).map(([k, v]) => [k, { ...v, busy: false }])) as Guided['st'] } : null }
}

export function loadDesign(scene?: string | null): Design {
  try {
    const raw = localStorage.getItem(designKey(scene))
    return raw ? reviveDesign(JSON.parse(raw) as Partial<Design>) : freshDesign()
  } catch { return freshDesign() }
}

/** every URL in the design moved to its new home (the draft's files into the Bible at Build the set) */
export function remapDesign(d: Design, moved: Record<string, string>): Design {
  if (!Object.keys(moved).length) return d
  const m = (u: string) => moved[u] ?? u
  return { ...d, pieces: d.pieces.map((p) => ({ ...p, looks: p.looks.map(m) })),
    guided: d.guided ? { ...d.guided, cast: d.guided.cast.map((c) => ({ ...c, cands: c.cands.map(m), ...(c.fixed ? { fixed: { ...c.fixed, look: c.fixed.look && m(c.fixed.look) } } : {}) })),
      props: (d.guided.props ?? []).map((c) => ({ ...c, cands: c.cands.map(m) })),
      st: Object.fromEntries(Object.entries(d.guided.st).map(([k, v]) => [k, { ...v, cands: v.cands.map(m) }])) as Guided['st'] } : null }
}
/**
 * The local copy changed and the server's draft has not caught up (set on every change, cleared once a write that saw the last
 * change lands). Scene opens on the server's draft, so without this a tab closed inside the save pause (or while the write was
 * out) reopened on the older server copy and the cast looks, the brief or the Draft toggle just made were lost.
 */
const unsyncedKey = (scene?: string | null) => `${designKey(scene)}.unsynced`
export const markUnsynced = (scene?: string | null) => { try { localStorage.setItem(unsyncedKey(scene), '1') } catch { /* blocked */ } }
export const clearUnsynced = (scene?: string | null) => { try { localStorage.removeItem(unsyncedKey(scene)) } catch { /* blocked */ } }
export const isUnsynced = (scene?: string | null): boolean => { try { return localStorage.getItem(unsyncedKey(scene)) === '1' } catch { return false } }

export function saveDesign(d: Design, scene?: string | null) {
  // object URLs (local drops) die with the page; everything else is kept
  try { localStorage.setItem(designKey(scene), JSON.stringify(d)) } catch { /* full or blocked: the design stays in memory */ }
}
