// The hero's actions: pick a point on his path (click it in the top view), then add a stop / look / turn / kneel / lift there, or
// describe a new move (track D2: DescribeMoveSlot opens Track E's panel in place). Each action lists where it sits (point and
// metres along the path) with its seconds or degrees; a made move lists the user's own words.
import type { ActionKind } from '../../../../stage3d/contract'
import { ACTION_DEFAULTS } from './blockingPlan'
import { DescribeMoveSlot } from './describeMoveSlot'
import type { Blocking } from './useBlocking'

const KINDS = (Object.keys(ACTION_DEFAULTS) as Exclude<ActionKind, 'idle'>[]).filter((k) => k !== 'move')
const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? undefined : Number(v))

export function ActionList({ b }: { b: Blocking }) {
  const { draft, point } = b
  return (
    <div className="bl-group" data-testid="blocking-actions">
      <div className="bl-head">Actions</div>
      <span className="st-field-hint" data-testid="blocking-point-line">
        {b.standing ? 'Standing: actions go on point 1, the mark.' : point === null ? 'Click a point on the hero path to place an action there.' : `Point ${point + 1} selected.`}
      </span>
      {b.reach && <span className="bl-warn" data-testid="blocking-reach">{b.reach}</span>}
      <div className="bl-row">
        {KINDS.map((k) => (
          <button key={k} type="button" className="st-btn" disabled={point === null || b.busy} onClick={() => b.actions.add(k)} title={ACTION_DEFAULTS[k].hint} data-testid={`blocking-action-add-${k}`}>
            {ACTION_DEFAULTS[k].label}
          </button>
        ))}
        <DescribeMoveSlot b={b} point={point} />
      </div>
      {draft.actions.map((a, i) => (
        <div key={i} className="bl-item" data-testid={`blocking-action-${i}`}>
          <span className="bl-item-name">{a.kind === 'move' ? a.words || a.motion || 'made move' : a.kind}</span>
          <span className="st-field-hint">{a.point >= 0 ? `point ${a.point + 1} · ` : ''}{a.at.toFixed(1)} m</span>
          {a.seconds !== undefined && (
            <label className="bl-mini">s<input className="st-input" type="number" step="0.5" min="0" value={a.seconds}
              onChange={(e) => b.actions.set(i, { seconds: num(e.target.value) ?? 0 })} data-testid={`blocking-action-${i}-seconds`} /></label>
          )}
          {a.deg !== undefined && (
            <label className="bl-mini">°<input className="st-input" type="number" step="15" value={a.deg}
              onChange={(e) => b.actions.set(i, { deg: num(e.target.value) ?? 0 })} data-testid={`blocking-action-${i}-deg`} /></label>
          )}
          <button type="button" className="st-btn bl-x" onClick={() => b.actions.remove(i)} aria-label="Remove action">×</button>
        </div>
      ))}
    </div>
  )
}
