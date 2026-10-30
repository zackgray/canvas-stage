// The picker for an EXPERIMENTAL free-text make: the best few tries side by side, each playable in the viewport before one is
// chosen, and a "none usable" way out. Nothing here is priced: Play here keeps (downloads) a try from the local motion computer.
import type { BoxTry } from '../../../../server/motion/types'
import { KEEP_FAIL_LINE } from './copy'
import { FallbackRow, READY_MADE, type FallbackMove } from './FallbackRow'
import { EXPERIMENTAL, FREE_NONE_LINE, HINT_LINE, NONE_USABLE_LINE } from './freeText'
import type { PickedMove } from './DescribeMovePanel'

/** how many ranked tries the picker lists */
export const PICKER_MAX = 5

export interface FreePickerProps {
  tries: readonly BoxTry[]
  pending: boolean
  keepError: boolean
  /** a fresh round is possible (the words are known) */
  canMore: boolean
  /** why a fresh round did not start, or null */
  moreWhy?: string | null
  onPick: (t: BoxTry, use: ((picked: PickedMove) => void) | undefined) => Promise<void>
  onMore: () => void
  onDismiss: () => void
  onPlayHere?: (picked: PickedMove) => void
  onUseThisOne?: (picked: PickedMove) => void
  onFallback?: (move: FallbackMove) => void
}

export function FreePicker({ tries, pending, keepError, canMore, moreWhy = null, onPick, onMore, onDismiss, onPlayHere, onUseThisOne, onFallback }: FreePickerProps) {
  const ranked = [...tries].sort((x, y) => x.rank - y.rank).slice(0, PICKER_MAX)
  return (
    <div data-testid="move-picker">
      <b className="st-field-hint" data-testid="move-experimental">{EXPERIMENTAL}</b>
      {ranked.length === 0
        ? <p className="bl-warn" data-testid="move-none">{FREE_NONE_LINE}</p>
        : (
          <>
            <p className="st-move-line" data-testid="move-picker-line"><b>Play each one here, then use the one that looks right.</b></p>
            {ranked.map((t, i) => (
              <div key={String(t.id)} className="st-move-primary" data-testid="move-option">
                <span className="st-field-hint">{i === 0 ? 'Option 1 (best match)' : `Option ${i + 1}`}</span>
                <button type="button" className="st-btn" disabled={pending} data-testid="move-option-play" onClick={() => void onPick(t, onPlayHere)}>Play here</button>
                <button type="button" className="st-btn st-primary" disabled={pending} data-testid="move-option-use" onClick={() => void onPick(t, onUseThisOne)}>Use this one</button>
              </div>
            ))}
            <p className="st-field-hint" data-testid="move-none-usable">{NONE_USABLE_LINE}</p>
          </>
        )}
      {keepError && <p className="bl-warn" data-testid="move-keep-error">{KEEP_FAIL_LINE}</p>}
      <p className="st-field-hint">{HINT_LINE}</p>
      <FallbackRow onFallback={onFallback} ready={READY_MADE} />
      <div className="bl-row">
        <button type="button" className="st-btn" data-testid="move-more" disabled={pending || !canMore} onClick={onMore}>Make another round</button>
        <button type="button" className="st-btn" data-testid="move-new" onClick={onDismiss}>None usable, describe another move</button>
      </div>
      {moreWhy && <p className="bl-warn" role="status" data-testid="move-another-why">{moreWhy}</p>}
    </div>
  )
}
