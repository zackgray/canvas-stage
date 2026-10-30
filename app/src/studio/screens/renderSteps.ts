// The Render screen's "what is next", from the Layout-To-Render facts only (no hooks), so it is unit-tested.
import type { L2RFacts } from '../render/l2rModel'

/** The one primary action: the render, its free finish, nothing left to do here, or why it cannot start. */
export type NextAction = 'needs-take' | 'needs-still' | 'l2r' | 'l2r-finish' | 'export'

/** a locked take with its clay (the prepared frames) is what a render needs first */
export const onL2RPath = (f: L2RFacts): boolean => f.take && f.clay

export function nextAction(f: L2RFacts): NextAction {
  if (!onL2RPath(f)) return 'needs-take'
  if (!f.still) return 'needs-still'
  if (!f.rendered || f.again) return 'l2r' // a first render, or the owner changed the seed / prompt / still since
  return f.finished ? 'export' : 'l2r-finish'
}
