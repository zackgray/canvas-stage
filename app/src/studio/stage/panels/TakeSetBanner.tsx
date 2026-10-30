// One line over the Stage's right panel while a locked take with its own set is on show (PLAN-PER-TAKE-SET.md, Design: Page): the
// stage shows the take's set and every set editor is read-only (setEditGate.ts); the button sets the take aside (takeShow.ts, the
// same set-aside a walk edit makes) and the scene's set comes back, editable. With a walk of its own too, it reads as the same one line the subject panel shows (onShowWords).
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { onShowWords, takeName } from '../../shoot/takeKeeps'
import { setTakeAside } from '../../shoot/takeShow'
import { useLockedTakes } from '../../shoot/worldTakes'

export function TakeSetBanner({ lab }: { lab: ProjectionLabState }) {
  const worldId = lab.kit?.id ?? null
  const takes = useLockedTakes(worldId)
  const s = lab.kit?.ownSet
  if (!s || !worldId) return null
  const name = takeName(takes.find((x) => x.id === s.takeId) ?? { id: s.takeId })
  return (
    <p className="st-field-hint" data-testid="take-set-banner">
      {onShowWords(name, !!lab.kit?.onShow?.perf, true)}{' '}
      <button type="button" className="st-link" data-testid="take-set-edit-scene" onClick={() => setTakeAside(worldId)}>Edit the scene's set</button>
    </p>
  )
}
