// What the owner should know before (or right after) the paid Render press, in plain words (QA run 5): the newest render came
// back black (from its record, so it outlives a reload; the press beside it carries the price of another try), and the approved
// opening still failed the layout check (it was approved anyway). A render follows the still and the frames together; the one
// render that came back black had a still scored 0.27 against the 0.38 bar. A warning, never a refusal: the owner decides.
import type { L2RHook } from './l2rModel'

type NoticeL2R = Pick<L2RHook, 'state' | 'price'>

/** the newest render's black-result line with the price of another try, or null */
export function blankNotice(l: NoticeL2R): string | null {
  const s = l.state
  const newest = s.status?.renders?.[0]
  if (!newest || newest.status !== 'failed' || !newest.blank || s.status?.running || s.posting) return null
  return `${newest.error ?? 'The render came back black. Nothing usable was saved.'} To try again, press Render${l.price !== null ? ` (≈ ${l.price} cr)` : ''}.`
}

/** the approved opening still failed the layout check: say so before the paid press */
export function layoutNotice(l: NoticeL2R): string | null {
  const layout = (l.state.status?.still as { layout?: { score?: number; ok?: boolean } | null } | null | undefined)?.layout
  if (!layout || layout.ok !== false) return null
  const score = typeof layout.score === 'number' ? ` (it scored ${layout.score.toFixed(2)} against the set)` : ''
  return `The approved opening still does not match the set's frames${score}. A render follows both, and when they disagree it can come back unusable. Draw a new opening still, or render anyway.`
}

/**
 * The notices as lines under the press (none while a render runs). `quietOnError`: the place already shows the store's fresh
 * error line (the Render page), which carries the same black-result sentence, so it is not said twice there.
 */
export function RenderNotices({ l, quietOnError = false }: { l: NoticeL2R; quietOnError?: boolean }) {
  if (l.state.status?.running || l.state.posting) return null
  const blank = quietOnError && l.state.error ? null : blankNotice(l), layout = layoutNotice(l)
  return (
    <>
      {blank && <p className="st-warn" data-testid="render-blank">{blank}</p>}
      {layout && <p className="st-warn" data-testid="render-layout-warn">{layout}</p>}
    </>
  )
}
