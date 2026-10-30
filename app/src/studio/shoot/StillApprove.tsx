import { useEffect, useRef, useState } from 'react'
import type { KitStill } from '../../../server/hero/kitSpec'

/**
 * The approve control of a still: one plain click, always live. A stale still cannot be approved (the title says why). One request
 * per press: a second press while the first is in flight sends nothing. Shared by the judge panel in the lightbox ("Approve") and
 * the panel over the viewport ("Accept"); the server's refusal of the press shows here after this control tried.
 */
export function StillApprove({ still, onApprove, disabled, approveError, label = 'Approve', testId = 'judge' }: {
  still: KitStill & { stale: boolean }; onApprove: (id: string) => void | Promise<void>; disabled?: boolean
  /** the server's refusal of the last approve, shown here after this control tried */
  approveError?: string | null; label?: string; testId?: string
}) {
  const [posting, setPosting] = useState(false)
  const [tried, setTried] = useState(false)
  const inFlight = useRef(false)
  useEffect(() => { setTried(false) }, [still.id])
  const submit = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setTried(true); setPosting(true)
    try { await onApprove(still.id) } finally { inFlight.current = false; setPosting(false) }
  }
  return (
    <>
      {still.approved
        ? <strong data-testid={`${testId}-approved`}>approved</strong>
        : posting ? <span className="st-muted" data-testid={`${testId}-approving`}>{label === 'Approve' ? 'Approving…' : 'Accepting…'}</span>
          : <button type="button" className="st-btn st-primary" disabled={disabled || still.stale} data-testid={`${testId}-approve`}
            title={still.stale ? 'Stale stills cannot be approved: draw the frame again' : 'Make this the approved still'}
            onClick={() => void submit()}>{label}</button>}
      {tried && !still.approved && !posting && approveError && <p className="st-warn" data-testid={`${testId}-approve-error`} role="alert">{approveError}</p>}
    </>
  )
}
