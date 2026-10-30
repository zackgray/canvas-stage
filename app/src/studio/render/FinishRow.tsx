import { PriceButton } from '../ui'
import { finishPending, gradeFor } from './finishChoice'
import { GRADE_DEFAULT } from './l2rExtra'
import type { L2RHook } from './l2rModel'

/**
 * The finish's one switch, free: "Grade: on / off", followed by a free Finish again (shown once there is a raw render to
 * finish). It changes the finished cut only; the raw render is never touched. (The grain and the sharpen are always on.)
 */
export function FinishRow({ l }: { l: L2RHook }) {
  const s = l.state, cur = l.current
  if (!s.status?.take) return null
  const picks = s.picks, grade = gradeFor(picks, cur)
  const target = s.status.gradeTarget
  const can = cur?.status === 'done' && !!cur.raw
  const again = (id: string) => can && cur && (
    <PriceButton verb="Finish again" price={0} disabled={s.working || l.finishingNow} testId={id} onClick={() => void l.finish(cur.id)}
      title={finishPending(picks, cur) ? 'Re-run the free finish with these switches; the raw render is kept' : 'Run the free finish again'} />
  )
  return (
    <div className="st-l2r-finish" data-testid="l2r-finishrow">
      {/* the grade needs a drawn master: a scene without one simply has no grade row (quiet, not an error) */}
      {target && (
        <div className="st-l2r-row" data-testid="l2r-grade">
          <label>
            <input type="checkbox" checked={grade !== null} onChange={(e) => l.setGrade(e.target.checked ? GRADE_DEFAULT : null)} />
            <span>Grade to the scene master</span>
          </label>
          {grade !== null && (
            <label className="st-field">
              <span className="st-knob-head">Strength<code>{Math.round(grade * 100)}%</code></span>
              <input type="range" className="st-range" min={0.1} max={1} step={0.05} value={grade} aria-label="Grade strength" data-testid="l2r-grade-strength"
                onChange={(e) => l.setGrade(Number(e.target.value))} />
            </label>
          )}
          {again('l2r-finish-grade')}
        </div>
      )}
    </div>
  )
}
