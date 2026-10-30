import type { PropParts } from '../../../shared/sceneContract'
// The prop card's ADVANCED text (object card wave): a prop keeps its Advanced tab (OWNER DECIDED 10-28: it directs the prompt) —
// "How the picture is taken", editable with Reset, kept per set in this browser and prepended to the words the card's
// 'Generate more pictures' press sends, so a stated view or light wins over the server's plain product-photo setup.
/** `parts` (prop-draw-parts): the ADVANCED boxes' edits, the same parts the Add dialog's draw sends (an old `framing` is no longer read) */
export interface PropPrefs { framing?: string; parts?: PropParts }

export type PropsPrefs = Record<string, PropPrefs>

/** the prop's ADVANCED parts ({} = every default) */
export const propParts = (worldId: string | null, tag: string): PropParts => readProps(worldId)[tag]?.parts ?? {}

export function setPropParts(worldId: string | null, tag: string, parts: PropParts): void {
  const all = readProps(worldId)
  const next: PropPrefs = { ...all[tag], parts }
  if (!Object.keys(parts).length) delete next.parts
  writeProps(worldId, { ...all, [tag]: next })
}

const KEY = (worldId: string) => `canvas-stage.stage-props.${worldId}`

/** every prop's kept Advanced text ({} when none, unreadable, or no world) */
export function readProps(worldId: string | null): PropsPrefs {
  if (!worldId) return {}
  try {
    const v = JSON.parse(localStorage.getItem(KEY(worldId)) ?? 'null') as PropsPrefs | null
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

export function writeProps(worldId: string | null, prefs: PropsPrefs): void {
  if (!worldId) return
  try { localStorage.setItem(KEY(worldId), JSON.stringify(prefs)) } catch { /* storage off: this page only */ }
}

