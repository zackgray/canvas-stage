// "Find a piece" on the set panel: every piece of the set by name with its distance from the performer's mark. The planner can stand
// a prop 25-35 m out where neither view shows it; Select picks it (its panel opens, the gizmo is on it) and Bring near moves it to
// a spot just in front of the performer (the piece route's own save, as a drag). Collapsed to a count until opened; nothing paid.
import { useState } from 'react'
import type { KitWorld } from '../../../labs/projection/stage3d/kitApi'
import { markOf } from '../../../stage3d/mark'
import type { SetPlaceState } from '../../scene/useSetPlace'
import { findList, nearMark } from '../setBounds'
import type { StagePick } from '../useStagePick'

export function FindPieces({ world, place, select }: { world: KitWorld; place?: SetPlaceState; select?: (p: StagePick | null) => void }) {
  const [open, setOpen] = useState(false)
  if (!select || world.plan.kit.length === 0) return null
  const mark = markOf(world.plan)
  const rows = findList(world.plan.kit, mark.at)
  const bring = (index: number) => {
    const it = world.plan.kit[index]
    void place?.drop(index, { at: nearMark(mark), yaw: it?.yawDeg ?? 0 })
    select({ t: 'piece', index })
  }
  return (
    <div className="st-find" data-testid="find-pieces">
      <button type="button" className="st-btn" aria-expanded={open} data-testid="find-toggle" onClick={() => setOpen(!open)}>
        {open ? 'Hide the pieces' : `Find a piece (${rows.length})`}
      </button>
      {open && (
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }} data-testid="find-list">
          {rows.map((r) => (
            <li key={r.index} style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '3px 0' }} data-testid={`find-row-${r.index}`}>
              <span style={{ flex: 1, minWidth: 0 }}>{r.name} <span className={r.far ? 'st-warn' : 'st-muted'}>{Math.round(r.metres)} m away{r.far ? ' (far)' : ''}</span></span>
              <button type="button" className="st-btn" data-testid={`find-select-${r.index}`} onClick={() => select({ t: 'piece', index: r.index })}>Select</button>
              {r.far && place && <button type="button" className="st-btn" data-testid={`find-bring-${r.index}`} onClick={() => bring(r.index)}
                title="Moves it to a spot just in front of the performer's mark">Bring near</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
