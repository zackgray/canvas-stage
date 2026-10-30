// The Stage's view switch (the merge, step 5): which of the lab viewport's panes are on — the Camera (the operator's
// view), a Free orbit (the default: the set is arranged first) and the Top View. One on fills the viewport; several split
// it (engine/panes.ts). The choice persists under the Stage's own key, but only for a stay on the Stage: a fresh arrival (from
// another step, or a reload of a scene whose Stage was not visited this session) opens on the Free view (stageArrival).
// The Set's split view keeps canvas-stage.setTop.
import type { PaneId } from '../../labs/projection/engine/panes'
import { ControlsButton } from '../ControlsButton'

export const PANES_KEY = 'canvas-stage.panes'
const ALL: readonly PaneId[] = ['camera', 'free', 'top']
/** each pane's name: on its switch and in its frame's corner (FrameGuide) */
export const PANE_LABELS: Record<PaneId, string> = { camera: 'Camera', free: 'Free view', top: 'Top View' }

export function readPanes(): PaneId[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(PANES_KEY) ?? 'null')
    if (Array.isArray(v)) {
      const on = v.filter((p): p is PaneId => ALL.includes(p as PaneId))
      if (on.length) return on
    }
  } catch { /* no or unreadable choice: the default */ }
  return ['free']
}

const VISITED = (scene: string) => `canvas-stage.stageVisited.${scene}`

/**
 * The panes the Stage opens with. `stay`: the user is already inside this scene's Stage (a reload of it, visited this session):
 * their saved choice. Any other arrival: the Free view (the set is arranged first), whatever was saved on an earlier visit.
 */
export function stageArrival(scene: string, stay: boolean): PaneId[] {
  let visited = false
  try { visited = sessionStorage.getItem(VISITED(scene)) === '1' } catch { /* no session memory: a fresh arrival */ }
  return stay && visited ? readPanes() : ['free']
}

/** this scene's Stage has been visited in this session (a reload of it keeps the saved choice) */
export function markStageVisited(scene: string): void {
  try { sessionStorage.setItem(VISITED(scene), '1') } catch { /* this visit only */ }
}

/** one pane always stays on: the viewport never goes blank */
export function ViewSwitch({ value, onChange }: { value: PaneId[]; onChange: (on: PaneId[]) => void }) {
  const toggle = (id: PaneId) => {
    const next = value.includes(id) ? value.filter((p) => p !== id) : [...value, id]
    const on = next.length ? next : [id]
    try { localStorage.setItem(PANES_KEY, JSON.stringify(on)) } catch { /* the choice lasts this visit */ }
    onChange(on)
  }
  return (
    <div className="st-seg st-seg-small" role="group" aria-label="View" data-testid="stage-panes">
      {ALL.map((id) => (
        <button key={id} type="button" className={value.includes(id) ? 'st-seg-on' : undefined} aria-pressed={value.includes(id)}
          data-testid={`stage-panes-${id}`} onClick={(e) => { toggle(id); e.currentTarget.blur() }}>{PANE_LABELS[id]}</button>
      ))}
      <ControlsButton />
    </div>
  )
}
