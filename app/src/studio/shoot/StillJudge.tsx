import { useEffect, useState } from 'react'
import { LAYOUT_WARNING, type KitStill } from '../../../server/hero/kitSpec'
import type { RedrawPass } from '../../../server/hero/redrawSpec'
import { KeepDiscard } from '../passes/KeepDiscard'
import { usePassCandidates } from '../passes/usePassCandidates'
import { PeopleStrip, PieceStrip } from './PeopleStrip'
import { StillApprove } from './StillApprove'
import { postRedraw, useStillJudge } from './useStillJudge'
import './judge.css'

type Item = KitStill & { stale: boolean }

/** after a redraw is sent, the pass list is read once more this soon (its candidate is on disk before the spend) */
export const SENT_REFRESH_MS = 400

/**
 * The judge under a still in the lightbox (troubleshooting items 2 and 3): the layout check, each staged person at 100 % beside their
 * card, the pieces with a board tile, the priced redraws, their candidates (Keep / Discard at 100 %), and Approve (one plain click;
 * a stale still cannot be approved).
 */
export function StillJudgePanel({ still, onApprove, disabled, onKept, approveError, noApprove }: {
  still: Item; onApprove: (id: string) => void | Promise<void>; disabled?: boolean
  /** the server's refusal of the last approve (the strip's error line, which the lightbox covers), shown here after this panel tried */
  approveError?: string | null
  /** a Keep made a new still from this one (its id, once the judge names it): the strip moves to it */
  onKept?: (newStillId: string | null) => void
  /** the approve control is shown elsewhere (the viewport overlay's Accept) */
  noApprove?: boolean
}) {
  const { judge, error, refresh } = useStillJudge(still.takeId, still.id)
  const passes = usePassCandidates(still.takeId)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  useEffect(() => setSendError(null), [still.id])
  const mine = passes.candidates.filter((c) => c.target.kind === 'still' && c.target.stillId === still.id && c.state !== 'discarded')
  const running = mine.some((c) => c.state === 'running')
  const layoutOff = !!still.layout && !still.layout.ok
  const checking = !judge && !error
  const why = still.stale ? 'Stale stills cannot be redrawn: draw the frame again'
    : judge?.redrawnInto ? 'This still was already redrawn into a newer one: redraw that one'
      : running ? 'A redraw of this still is running' : sending ? 'Sending the redraw…' : undefined
  const redraw = async (pass: RedrawPass, subject: string) => {
    setSending(true); setSendError(null)
    const sent = postRedraw({ takeId: still.takeId, stillId: still.id, pass, subject })
    const t = setTimeout(() => void passes.refresh(), SENT_REFRESH_MS)
    const err = await sent
    clearTimeout(t); setSending(false)
    if (err) setSendError(err)
    await passes.refresh()
  }
  const keep = async (id: string) => { await passes.keep(id); const j = await refresh(); onKept?.(j?.redrawnInto ?? null) }
  const flagCount = judge?.people.filter((p) => p.status === 'off' || p.status === 'unknown').length ?? 0
  return (
    <section className="st-judge" data-testid="still-judge" onClick={(e) => e.stopPropagation()}>
      <div className="st-judge-head">
        <p className={layoutOff ? 'st-warn' : 'st-muted'} data-testid="judge-layout" title={still.layout ? `layout ${still.layout.score.toFixed(2)}` : undefined}>
          {still.layout ? (layoutOff ? LAYOUT_WARNING : 'The set matches the 3D set\'s layout.') : 'No layout check on this still.'}
        </p>
        {checking && <p className="st-muted" data-testid="judge-checking">Checking the people…</p>}
        {error && <p className="st-warn" data-testid="judge-error">{error}</p>}
        {judge && !judge.kit && <p className="st-muted" data-testid="judge-nokit">No 3D set to check the people against.</p>}
        {judge && flagCount > 0 && <p className="st-warn" data-testid="judge-flag">{flagCount === 1 ? 'One person needs a look at 100 %.' : `${flagCount} people need a look at 100 %.`}</p>}
        {judge?.redrawnInto && <p className="st-muted" data-testid="judge-redrawn">A redraw of this still was kept as a newer still.</p>}
        {!noApprove && <StillApprove still={still} onApprove={onApprove} disabled={disabled} approveError={approveError} />}
      </div>
      {judge && <PeopleStrip judge={judge} src={still.png} onRedraw={(p, s) => void redraw(p, s)} disabled={!!why} why={why} />}
      {judge && <PieceStrip judge={judge} src={still.png} onRedraw={(p, s) => void redraw(p, s)} disabled={!!why} why={why} />}
      {(sendError || passes.error) && <p className="st-warn" data-testid="judge-send-error">{sendError ?? passes.error}</p>}
      {mine.map((c) => (
        <KeepDiscard key={c.id} candidate={c} busy={passes.busy.has(c.id)} onKeep={() => void keep(c.id)} onDiscard={() => void passes.discard(c.id)} onRecover={() => void passes.recover(c.id)} />
      ))}
    </section>
  )
}
