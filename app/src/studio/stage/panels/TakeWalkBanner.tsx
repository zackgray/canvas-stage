// One line at the top of the subject panel while a locked take plays its own walk (PLAN-PER-TAKE-PERFORMANCE.md §1): the panel edits
// the scene's walk (the next take's), never the take's; the first change sets the take aside (takeShow.ts), a click on it in the
// take list brings its walk back. A take that also has its own other set reads as one line with the set panel's (onShowWords).
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { onShowWords, takeName } from '../../shoot/takeKeeps'
import { useLockedTakes } from '../../shoot/worldTakes'

export function TakeWalkBanner({ lab }: { lab: ProjectionLabState }) {
  const takes = useLockedTakes(lab.kit?.id ?? null)
  const s = lab.kit?.onShow
  if (!s?.perf) return null // a take on show with only its own set plays the scene's walk
  const t = takes.find((x) => x.id === s.takeId)
  const name = takeName(t ?? { id: s.takeId })
  return (
    <p className="st-field-hint" data-testid="take-walk-banner">
      {onShowWords(name, true, !!lab.kit?.ownSet)}
    </p>
  )
}
