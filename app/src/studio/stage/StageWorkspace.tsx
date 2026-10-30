// The Stage screen (the merge; the Stage simplification): a status line (each phrase is the button that selects the thing it
// names), the view switch (Free view, Top View, Camera) and the panel host (StagePanel routes on the one selection: nothing picked
// -> the set panel in Free view / Top View, the Camera panel in the Camera view; a piece -> its panel; the person -> hers). The
// selection (useStagePick) is the one state behind the viewport's picking and the status line alike. The pane set may be owned by
// the shell (StudioApp). A right-click opens the menus (useStagePick), rendered over the viewport by the panel host
// (StagePanel, W3-E2): the person's (Walk to a spot / Slow walk / Run / Hold here / Edit look), a piece's (Move to a spot /
// Edit look / Duplicate / Remove; a plain piece swaps), or the marked spot's "Add here" (choosing a kind lands in the
// retired rail's Add mode, the one strip piece with no new home yet — see the W3-E2 report). The camera is the Operator for
// the Stage's whole life (one camera
// mode; its gizmo hidden). A no-UI hero publisher (HeroStillBlock bare) keeps the draw bar's "Draw the first frame" press alive.
// A scene with no set yet (setup mode) shows the Setup panel instead of the status line, the panels and the steps, and one line
// over the empty viewport; once Build the set lands its world, the scene's facts name it and this is the normal Stage. A scene with
// no words yet opens with the Prompt box open and focused (PromptDrawer.tsx): no card over the viewport.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaneId } from '../../labs/projection/engine/panes'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { KitBuildDeps } from '../kit/useKitBuild'
import type { BibleApi } from '../scene/bibleApi'
import { HeroStillBlock } from '../shoot/HeroStillBlock'
import { useHideGizmo } from '../screens/useHideGizmo'
import { useCurrentScene } from '../../library/currentScene'
import { pickHasViewer } from './railModel'
import { StagePanel } from './panels/StagePanel'
import { ShotSteps } from './panels/ShotSteps'
import { useCameraPanel } from './useCameraPanel'
import { StartingStage } from './panels/StartingStage'
import { useAutoReapprove } from './useAutoReapprove'
import { useSavedCamera } from './useSavedCamera'
import { useFrameSet } from './useFrameSet'
import { StageTakeRestore } from './StageTakeRestore'
import { useStagePick, type StagePick } from './useStagePick'
import { readPanes, ViewSwitch } from './ViewSwitch'
import './stage.css'

interface Props {
  lab: ProjectionLabState
  /** the Bible routes and the kit build's steps, as the Scene screen's set screen takes them (production defaults) */
  api?: BibleApi
  kit?: KitBuildDeps
  /** the pane set, when the shell owns it (the arrange tip and the render overlay float over the same viewport); absent = this screen owns it */
  panes?: PaneId[]
  onPanes?: (on: PaneId[]) => void
}

/** the status line's state words (each is a button that selects the thing it names) */
const STATUS = [{ id: 'set', label: 'The set' }, { id: 'subject', label: 'The subject' }] as const

/** One screen behind the Stage route: the status line, the view switch and the selection-routed panel host. */
export function StageWorkspace({ lab, api, kit, panes: panesProp, onPanes }: Props) {
  const pickedRef = useRef<ReturnType<typeof useStagePick> | null>(null)
  // one camera mode: the Operator, set once as the Stage opens (its projector gizmo hidden)
  const setMode = lab.op.setMode
  useEffect(() => { setMode('operator') }, [setMode])
  useHideGizmo(lab.stage, true)
  // an approved set stays approved while it is edited here: approved again (free) once the edits settle
  useAutoReapprove(lab.kit?.id ?? null)
  // the camera opens where the saved take starts (once per scene on this page visit)
  useSavedCamera(lab, true)
  // a set with a piece far out (a stand-in 25-35 m away) opens the Free view and the Top View on the whole set
  useFrameSet(lab)
  // a figure double-click on a thing with pictures (the performer, a prop) picks it and opens its card (useStagePick asks); a kit
  // piece has no picture, so its double-click stays the canvas' own (the orbit pivot's re-place)
  const onFigureDbl = useCallback((sp: StagePick): boolean => {
    const item = sp.t === 'piece' ? lab.kit.world?.plan.kit[sp.index] ?? null : null
    if (!pickHasViewer({ pickKind: sp.t, item, hasCastCard: true })) return false
    pickedRef.current?.select(sp)
    return true
  }, [lab.kit.world])
  const picked = useStagePick(lab, undefined, onFigureDbl)
  pickedRef.current = picked
  const [ownPanes, setOwnPanes] = useState(readPanes)
  const panes = panesProp ?? ownPanes
  const setPanes = onPanes ?? setOwnPanes
  useEffect(() => { lab.stage?.panes.set(panes) }, [lab.stage, panes])
  // the Camera panel shows while the Camera pane is the one last pressed (alone, or beside the Free / Top View); the rail's show/hide
  // follows its own word from the shell
  const cameraView = useCameraPanel(lab.stage, panes)
  // the scene is read and names no world yet: its starting world is being written (useStageBuild.ts)
  const view = useCurrentScene().view
  if (view && !view.worldId) {
    return (
      <div className="st-ws" data-testid="stage-workspace">
        <StartingStage />
      </div>
    )
  }
  return (
    <div className="st-ws" data-testid="stage-workspace">
      <div className="st-ws-status" data-testid="stage-status">
        <span className="st-ws-tabs" role="group" aria-label="The panel shows">
          {STATUS.map((s) => (
            <button key={s.id} type="button" data-testid={`stage-word-${s.id}`}
              aria-pressed={s.id === 'subject' ? picked.pick?.t === 'mark' : picked.pick === null}
              onClick={() => picked.select(s.id === 'subject' ? { t: 'mark' } : null)}>{s.label}</button>
          ))}
        </span>
        <span className="st-ws-views">
          <ViewSwitch value={panes} onChange={setPanes} />
        </span>
      </div>
      <StagePanel lab={lab} api={api} kit={kit} pick={picked.pick} select={picked.select} place={picked.p} cameraView={cameraView}
        menu={picked.menu} chooseMenu={picked.choose} cardAsk={picked.cardAsk} />
      <ShotSteps lab={lab} cameraView={cameraView} />
      {/* the no-UI publisher: the first frame's press never disappears with the panel */}
      <HeroStillBlock lab={lab} pressInBar bare />
      <StageTakeRestore lab={lab} />
    </div>
  )
}
