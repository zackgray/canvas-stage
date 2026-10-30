// The words changed since the take's first frame was drawn, and nothing else did (wordsOnFrame.ts, owner 10-29): in the Render
// press's place, a plain line and two priced presses instead of a bare refusal. Redraw the first frame from the new words (the
// Stage's own draw press), or render the new words on this frame (the paid render, sent with wordsOnFrame; the frame stays valid
// and the render records that its words differ). Every other stale reason keeps refusing as before and never shows this.
import { PriceButton } from '../ui'
import { WORDS_CHANGED } from '../../shared/wordsOnFrame'
import type { L2RHook } from './l2rModel'

/** the Stage's draw press, as the steps block has it (heroPublished.ts); null where there is none (the Render page) */
export interface RedrawPress { price: number | null; disabled: boolean; title?: string; onPress: () => void }

/** the paid render press is up and the take's words moved since its first frame: the choice replaces that press */
export const wordsChoiceDue = (l: Pick<L2RHook, 'facts'>, pressUp: boolean): boolean => pressUp && !!l.facts.wordsChanged

export function WordsChoice({ l, redraw, price, disabled, why }: { l: Pick<L2RHook, 'render'>; redraw: RedrawPress | null; price: number | null; disabled: boolean; why?: string | null }) {
  return (
    <div className="st-words-choice" data-testid="words-choice">
      <p className="st-muted" data-testid="words-choice-line">{WORDS_CHANGED}</p>
      <div className="st-actions">
        {redraw && <PriceButton verb="Redraw the first frame" price={redraw.price} disabled={redraw.disabled || redraw.price === null} testId="words-redraw"
          title={redraw.title ?? 'Draws a new first frame from the words as they are now; approve it, then render'} onClick={redraw.onPress} />}
        <PriceButton verb="Render the new words on this frame" price={price} disabled={disabled || price === null} testId="words-render"
          title={why ?? 'Renders the words as they are now over this first frame, which was drawn from the earlier words'} onClick={() => void l.render({ wordsOnFrame: true })} />
      </div>
    </div>
  )
}
