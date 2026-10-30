import { useRef } from 'react'
import { Progress } from './Progress'
import { formatPrice } from './format'

export interface RunPillProps {
  /** what is being drawn now: "Drawing the look", "Rendering the take" */
  label: string
  /** when the job started (epoch ms or ISO string); without one the clock starts when the pill appears */
  since?: number | string | null
  /** the wait in words: "about 2 minutes" */
  estimate: string
  /** what the press already cost, in the same form PriceButton takes (a number = credits) */
  price?: number | string | null
  /** the clock's "now" for tests */
  now?: number
  testId?: string
}

/** Shown in place of a paid button while its job runs: label, clock, the wait, a moving bar and the price already spent. */
export function RunPill({ label, since, estimate, price = null, now, testId = 'run-pill' }: RunPillProps) {
  const mounted = useRef(Date.now())
  const spent = formatPrice(price)
  return (
    <div className="st-runpill" role="status" data-testid={testId}>
      <Progress label={label} startedAt={since ?? mounted.current} now={now} />
      <div className="st-runpill-note">
        <span data-testid={`${testId}-estimate`}>{estimate}</span>
        {spent !== null && spent !== 'free' && <span className="st-price" data-testid={`${testId}-spent`}>{spent} spent</span>}
      </div>
    </div>
  )
}
