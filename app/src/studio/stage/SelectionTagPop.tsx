// The small pop-up over selected words (tag-from-pasted-prompt): "Make this a character" / "Make this a prop". Free: a press only
// turns the selection into an @tag (a draft tile, nothing drawn, no credits) and opens its card. Shown only while the selection
// could be tagged. The presses keep the box's selection (mousedown is not taken from the box).
import { tagFromSelection } from './wordsTags'

export type MadeKind = 'person' | 'prop'

export function SelectionTagPop({ text, start, end, taken, onMake }: {
  text: string; start: number; end: number; taken: readonly string[]; onMake: (kind: MadeKind) => void
}) {
  if (start === end || !tagFromSelection(text, start, end, taken)) return null
  const press = (kind: MadeKind, label: string) => (
    <button type="button" className="st-link" data-testid={`make-${kind}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onMake(kind)}>{label}</button>
  )
  return (
    <div className="st-seltag" role="toolbar" aria-label="Tag the selected words" data-testid="selection-tag-pop">
      {press('person', 'Make this a character')}
      {press('prop', 'Make this a prop')}
    </div>
  )
}
