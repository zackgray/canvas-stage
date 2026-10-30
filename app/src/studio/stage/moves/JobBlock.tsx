// The Describe-a-move panel's job states: making (a working line with the time so far, and Cancel — the rest of the Stage stays
// usable), the result (one move, the best of the tries: Play here, Use this one, Try another, Discard), failed (fallbacks and Try
// again), lost contact (Check again), and cancelled. No try names or counts reach the user. Server messages are never rendered
// verbatim; the copy here is the plan's.
import { RunPill } from '../../ui'
import type { BoxTry } from '../../../../server/motion/types'
import { allDroppedLine, CANCELLED_LINE, FAILED_LINE, KEEP_FAIL_LINE, LOST_LINE, makeEstimate, MAKING_LINE, NO_SPEC_LINE, resultLine } from './copy'
import { FreePicker } from './FreePicker'
import { isFreeSpec } from './freeText'
import { FallbackRow, READY_MADE, type FallbackMove } from './FallbackRow'
import type { PickedMove } from './DescribeMovePanel'
import type { MotionComputer } from './useMotionComputer'
import type { PanelJob } from './client'

export interface JobBlockProps {
  mc: MotionComputer
  /** the make shown (hers) */
  job: PanelJob
  pending: boolean
  keepError: boolean
  /** why Try another's fresh round did not start (busy, refused), or null */
  moreWhy?: string | null
  /** keep the try, then hand the picked move to the given callback (Play here / Use this one) */
  onPick: (t: BoxTry, use: ((picked: PickedMove) => void) | undefined) => Promise<void>
  /** run the last spec again (Try again, or Try another once the ranked tries are used up) */
  onMore: (n?: number) => void
  onDismiss: () => void
  /** a spec to make again is known (after a reload the panel no longer has the words: Try again / Make 8 more say so instead) */
  canMore?: boolean
  onPlayHere?: (picked: PickedMove) => void
  onUseThisOne?: (picked: PickedMove) => void
  onFallback?: (move: FallbackMove) => void
}

export function JobBlock({ mc, job, pending, keepError, moreWhy = null, onPick, onMore, onDismiss, onPlayHere, onUseThisOne, onFallback, canMore = true }: JobBlockProps) {
  const noMore = canMore ? undefined : NO_SPEC_LINE
  // any stage that is not an ending is still making the move: the working state, never an empty panel
  const making = (
    <div data-testid="move-making">
      <RunPill label={MAKING_LINE} since={job.startedAt ?? null} estimate={makeEstimate(mc.secondsPerTry, job.of)} testId="move-making-pill" />
      <div className="bl-row">
        <button type="button" className="st-btn" data-testid="move-cancel" disabled={pending} onClick={() => void mc.cancel()}>Cancel</button>
      </div>
    </div>
  )
  switch (job.stage) {
    case 'done':
      // an experimental free-text make: a picker of the best few tries, never one move or the all-dropped line
      if (isFreeSpec(job.spec)) return (
        <FreePicker tries={job.tries} pending={pending} keepError={keepError} canMore={canMore} moreWhy={moreWhy} onPick={onPick}
          onMore={() => onMore()} onDismiss={onDismiss} onPlayHere={onPlayHere} onUseThisOne={onUseThisOne} onFallback={onFallback} />
      )
      // every try dropped: no cards to show, so say so once with what to change, and offer the ready-made moves and Try again
      if (!job.tries.length) return (
        <div data-testid="move-failed">
          <p className="bl-warn" data-testid="move-all-dropped">{allDroppedLine(job.dropped.reason)}</p>
          <FallbackRow onFallback={onFallback} ready={READY_MADE} />
          {noMore && <p className="st-field-hint" data-testid="move-no-spec">{noMore}</p>}
          <div className="bl-row">
            <button type="button" className="st-btn" data-testid="move-retry" disabled={!!noMore} title={noMore} onClick={() => onMore()}>Try again</button>
            <button type="button" className="st-btn" data-testid="move-new" onClick={() => onDismiss()}>Describe another move</button>
          </div>
        </div>
      )
      {
        // one move: the app picks the best (the box ranks them, steadiest hands first); Try another shows the next-best, then
        // makes a fresh round when none are left (free)
        const ranked = [...job.tries].sort((x, y) => x.rank - y.rank)
        const at = Math.min(job.shown ?? 0, ranked.length - 1), t = ranked[at]
        const next = ranked[at + 1]
        // Try another always does something you can see: the next-best plays here at once, or a fresh round starts (the working
        // state); when neither can, the line under it says why
        const another = () => {
          if (next) { void mc.show(at + 1); void onPick(next, onPlayHere) } else onMore()
        }
        return (
          <div data-testid="move-results">
            <p className="st-move-line" data-testid="move-result-line"><b>{resultLine(at)}</b></p>
            <div className="st-move-primary" data-testid="move-result">
              <button type="button" className="st-btn" disabled={pending} data-testid="move-play" onClick={() => void onPick(t, onPlayHere)}>Play here</button>
              <button type="button" className="st-btn st-primary" disabled={pending} data-testid="move-use" onClick={() => void onPick(t, onUseThisOne)}>Use this one</button>
            </div>
            {keepError && <p className="bl-warn" data-testid="move-keep-error">{KEEP_FAIL_LINE}</p>}
            <div className="st-move-secondary">
              <button type="button" className="st-btn" data-testid="move-another" disabled={pending || (!!noMore && !next)}
                title="Free: another way to do it, or a fresh round" onClick={another}>Try another</button>
              <button type="button" className="st-btn" data-testid="move-new" onClick={() => onDismiss()}>Discard</button>
            </div>
            {noMore && !next && <p className="st-field-hint" data-testid="move-no-spec">{noMore}</p>}
            {moreWhy && <p className="bl-warn" role="status" data-testid="move-another-why">{moreWhy}</p>}
          </div>
        )
      }
    case 'failed':
      return (
        <div data-testid="move-failed">
          <p className="bl-warn">{FAILED_LINE}</p>
          <FallbackRow onFallback={onFallback} ready={READY_MADE} />
          {noMore && <p className="st-field-hint" data-testid="move-no-spec">{noMore}</p>}
          <div className="bl-row">
            <button type="button" className="st-btn" data-testid="move-retry" disabled={!!noMore} title={noMore} onClick={() => onMore()}>Try again</button>
            <button type="button" className="st-btn" data-testid="move-new" onClick={() => onDismiss()}>Describe another move</button>
          </div>
        </div>
      )
    case 'cancelled':
      return (
        <div data-testid="move-cancelled">
          <p className="st-field-hint">{CANCELLED_LINE}</p>
          <div className="bl-row"><button type="button" className="st-btn" data-testid="move-new" onClick={() => onDismiss()}>Describe another move</button></div>
        </div>
      )
    case 'lost':
      return (
        <div data-testid="move-lost">
          <p className="bl-warn">{LOST_LINE}</p>
          <div className="bl-row"><button type="button" className="st-btn" data-testid="move-check" onClick={() => void mc.checkAgain()}>Check again</button></div>
        </div>
      )
    default:
      return making
  }
}
