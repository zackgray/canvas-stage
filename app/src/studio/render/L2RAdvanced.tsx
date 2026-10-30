import { Advanced } from '../ui'
import { FinishRow, HoldRow, KeyframeRows } from './L2RChoices'
import { FacePassRow } from './FacePassRow'
import { PromptOverride, PromptSaid, usePromptPreview } from './PromptBox'
import { RefChips } from './RefChips'
import { advancedChanged, advancedLabel } from './advancedChanges'
import type { L2RHook } from './l2rModel'

/**
 * Everything on Render that is not the shots list, the look beside the layout, the player and Export: the free finish (depth of
 * field, grade), what this render says (read-only), the reference chips and, once a render exists, the face pass. The choices a
 * take's defaults already cover (hold the clay, the mid / end keyframes, the prompt override) sit under a collapsed More. Closed
 * by default; its header counts the controls that are off their default, More's included (a paid render reads them).
 */
export function L2RAdvanced({ l, onOpenChip }: { l: L2RHook; onOpenChip: (i: number) => void }) {
  const s = l.state
  const preview = usePromptPreview(l)
  return (
    <Advanced stage="render" label={advancedLabel(advancedChanged(s, l.current))}>
      <div className="st-l2r-adv" data-testid="l2r-advanced">
        <FinishRow l={l} />
        <PromptSaid l={l} preview={preview} />
        <RefChips chips={s.status?.chips} onOpen={onOpenChip} />
        {s.status?.takeBible && <p className="st-muted" data-testid="l2r-take-bible">{s.status.takeBible}</p>}
        <FacePassRow render={l.current} takeId={s.takeId} />
        <Advanced stage="render-more" label="More">
          <div className="st-l2r-adv" data-testid="l2r-more">
            <HoldRow l={l} />
            <KeyframeRows l={l} />
            <PromptOverride l={l} preview={preview} />
          </div>
        </Advanced>
      </div>
    </Advanced>
  )
}
