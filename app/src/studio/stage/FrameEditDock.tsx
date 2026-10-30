// Under the picture in the first-frame window (owner 10-29): "Edit this frame", the version strip (one click = the frame in use, no
// Approve press), then Draw another with its price on the left and Render clip, the window's primary, on the right. The edit model
// is the draw bar's (frameEditStore), so a running edit, its result and the typed words are still here when the window reopens. A
// version clicked here becomes the frame through the same approval as ever; the window holds on across it (firstFrameView `also`).
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { setFrameView } from '../shoot/firstFrameView'
import { DrawPress } from './DrawPress'
import { FrameEditPanel } from './FrameEditPanel'
import { FrameVersionsStrip } from './FrameVersionsStrip'
import { RenderClip } from './RenderClip'
import type { FrameEditModel } from './useFrameEdit'
import { useStageRender } from './useStageRender'

/** `frameId`: the still the window opened on (the take's frame); `onScreen`: the version it shows now; `lab`: the Stage's (the
 *  presses need it; without one only the edit box and the strip show) */
export function FrameEditDock({ model, frameId, onScreen, lab, onStill, onClip }: { model: FrameEditModel; frameId: string; onScreen: string; lab?: ProjectionLabState
  /** a version was picked: the window shows the still (what will render) */
  onStill?: () => void
  /** the take has a finished clip: play it in the window */
  onClip?: () => void }) {
  const here: FrameEditModel = {
    ...model,
    onSelect: async (id: string) => { onStill?.(); setFrameView(id, 'still', [frameId]); await model.onSelect(id) },
  }
  return (
    <div className="st-hero-overlay-edit" data-testid="frame-edit-dock">
      <div className="st-dock-top">
        <FrameEditPanel model={here} />
        <FrameVersionsStrip model={here} onScreen={onScreen} />
        {lab && <DockDraw lab={lab} />}
      </div>
      {lab && <DockRender lab={lab} onScreen={onScreen} onClip={onClip} />}
    </div>
  )
}

/** Draw another, under the strip (it scrolls with the box when the column is short); its sent words open in place, not as a
 *  pop-up, which the scrolling column would cut */
function DockDraw({ lab }: { lab: ProjectionLabState }) {
  const r = useStageRender(lab)
  return <DrawPress verb="Draw another" primary={false} building={r.building} worldId={lab.kit?.id ?? null} nudge={false} />
}

/** Render clip and its sent words, held at the bottom right of the column: always in view */
function DockRender({ lab, onScreen, onClip }: { lab: ProjectionLabState; onScreen: string; onClip?: () => void }) {
  const r = useStageRender(lab)
  return <div className="st-dock-presses" data-testid="frame-dock-presses"><RenderClip r={r} onScreen={onScreen} onClip={onClip} /></div>
}
