// The "Edit this frame" box (owner 10-28), in the first-frame window's side column (owner 10-29: FrameEditDock): one
// typed change on the picked version of the first frame, the price beside the press (never a silent spend), the FINDINGS'
// warnings free and local. The new picture lands as a new version in the strip (FrameVersionsStrip); the press is a scene job, so
// it stays disabled on every screen while it runs, and a running edit shows its line here again when the still view reopens.
import { PriceButton } from '../ui'
import { FRAME_EDIT_CREDITS } from '../../../server/frameEdit/spec'
import type { FrameEditModel } from './useFrameEdit'

/** The always-on note under the box: what a still edit is (the qwen-abilities FINDINGS, in the owner's words). */
const STILL_ONLY_NOTE = 'Edits the still, one change at a time. The edit holds only while the edited area stays in frame; it cannot move the camera or re-frame.'

export function FrameEditPanel({ model }: { model: FrameEditModel }) {
  if (model.editing || (model.running && model.phase)) {
    return (
      <div className="st-frameedit" data-testid="frame-edit">
        <p className="st-muted" data-testid="frame-edit-phase">{model.phase ?? 'Editing the frame…'}</p>
      </div>
    )
  }
  return (
    <div className="st-frameedit" data-testid="frame-edit" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input type="text" value={model.text} onChange={(e) => model.onText(e.target.value)} data-testid="frame-edit-text"
        placeholder="One change, in plain words: “remove the hat brim”, “make the car silver”, “add fog”…" style={{ width: '100%', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {model.base && <img src={model.base.png} alt="The version the edit starts from" width={64} height={36} data-testid="frame-edit-base"
          title={`The edit starts from this version (${model.base.id})`} style={{ display: 'block' }} />}
        <PriceButton verb="Edit this frame" price={FRAME_EDIT_CREDITS} testId="frame-edit-press" disabled={model.gate !== null}
          title={model.gate ?? 'Runs the edit on the shown version; the new picture is a new version, nothing is overwritten'}
          onClick={model.onPress} />
      </div>
      <p className="st-muted" data-testid="frame-edit-note" style={{ margin: 0, fontSize: 12 }}>{STILL_ONLY_NOTE}</p>
      {model.warning && <p className="st-warn" data-testid="frame-edit-warning" style={{ margin: 0 }}>{model.warning}</p>}
      {model.error && <p className="st-warn" data-testid="frame-edit-error" style={{ margin: 0 }}>{model.error}</p>}
    </div>
  )
}
