import { useCut } from '../labs/projection/cut'
import { LabViewport } from '../labs/projection/ui/LabViewport'
import { useProjectionLab } from '../labs/projection/useProjectionLab'
import { useCurrentScene } from '../library/currentScene'
import { useOpenScene } from '../library/useOpenScene'
import { HangNotices } from '../jobs/HangNotices'
import { useAttachJobs, useCurrentJobs } from '../jobs/useSceneJobs'
import { useLeaveGuard } from '../jobs/leaveGuard'
import { useShellProject } from './project/shellProject'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaneId } from '../labs/projection/engine/panes'
import '../labs/projection/projection.css'
import type { StudioRoute } from './route'
import { Home } from './home/Home'
import { Stepper } from './home/Stepper'
import { SceneTitle } from './scene/SceneTitle'
import { StageScreen } from './StageScreen'
import { PromptDrawer } from './stage/PromptDrawer'
import { StudioView } from './StudioView'
import { DrawBar } from './stage/DrawBar'
import { StageRail } from './stage/StageRail'
import { ArrangeTip } from './stage/ArrangeTip'
import { StageRailProvider } from './stage/railBus'
import { StageSceneProvider } from './stage/scene/StageScene'
import { markStageVisited } from './stage/ViewSwitch'
import { arrivalPanes, setStageMemo } from './stage/stageMemory'
import { useLabDefaults } from './useLabDefaults'
import { useStudioKeys } from './useStudioKeys'
import './tokens.css'
import './studio.css'
import './screens/screens.css'

/**
 * The app: Home at #/studio (no scene named), and a scene at #/studio/<scene>/<stage>, the shell around ONE projection lab (one Stage, one job guard), with a screen per stage.
 * A stage switch changes the route prop; the lab and its viewport stay mounted. Every stage reads the route's scene (its draft, its
 * current set and, through it, its takes), and the scene's paid jobs are kept in step with the server here, so a reload mid-job
 * re-attaches to them.
 */
export default function StudioApp({ route }: { route: StudioRoute }) {
  return route.scene ? <SceneStudio route={{ ...route, scene: route.scene }} /> : <Home />
}

function SceneStudio({ route }: { route: StudioRoute & { scene: string } }) {
  const { stage } = route
  useOpenScene(route.scene)
  const scene = useCurrentScene()
  const jobs = useCurrentJobs()
  useAttachJobs(jobs)
  useLeaveGuard(jobs) // a queued paid press is dropped when the page goes: ask first
  const lab = useProjectionLab({ onStage: stage === 'stage' })
  const project = useShellProject()
  const cut = useCut()
  // L1: the pane set lives at the shell, so the chrome over the viewport (the rail) and the screen's own controls (the
  // view switch) share one state. L2: what the rail shows is published by the Stage screen through the rail bus provider.
  // L4: the arrange tip pill rides the viewport too, in the first Free/Top pane (never over the Camera pane's own hint).
  // coming back to a scene's Stage in this page's life (from Render or Export) finds the view it was left on (stageMemory.ts, owner
  // 2026-10-28); a first arrival opens on the Free view, and a reload of a Stage visited this session keeps the saved choice
  const [panes, setPanesNow] = useState<PaneId[]>(() => (stage === 'stage' ? arrivalPanes(route.scene, true) : ['free']))
  const setPanes = useCallback((on: PaneId[]) => { setPanesNow(on); setStageMemo({ panes: on }, route.scene) }, [route.scene])
  const was = useRef({ stage, scene: route.scene })
  useEffect(() => {
    const before = was.current
    was.current = { stage, scene: route.scene }
    if (stage === 'stage' && (before.stage !== 'stage' || before.scene !== route.scene)) setPanesNow(arrivalPanes(route.scene, false))
    if (stage === 'stage') markStageVisited(route.scene)
  }, [stage, route.scene])
  const arranging = stage === 'stage' && panes.some((p) => p !== 'camera') // Free view / Top View are on
  const ready = !!route.scene && scene.id === route.scene && !!scene.view
  useLabDefaults(lab, ready ? scene.view!.worldId : undefined)
  useStudioKeys(stage, stage === 'stage' && lab.op.mode === 'operator', route.scene)
  // the Stage's one copy of the scene design (the drawer, the person maker): on every scene stage; the provider stays put
  // across stage switches so nothing remounts
  return (
    <StageRailProvider>
      <StageSceneProvider scene={route.scene} worldId={ready ? scene.view!.worldId : null} lab={lab} live={ready}>
        <StudioView stage={stage} projectName={scene.view?.name ?? project.name} title={ready ? <SceneTitle name={scene.view!.name} /> : undefined}
          viewport={<LabViewport lab={lab} camera={stage !== 'stage' || panes.includes('camera')}>{stage === 'stage' && <><StageRail show={arranging} /><ArrangeTip stage={lab.stage} show={arranging} /></>}</LabViewport>}
          transport={stage === 'stage' ? <DrawBar lab={lab} /> : undefined} drawer={<PromptDrawer lab={lab} />}
          screen={ready ? <><HangNotices store={jobs} /><StageScreen key={route.scene} stage={stage} lab={lab} cut={cut} panes={panes} onPanes={setPanes} /></>
            : <p className="st-muted" data-testid="scene-opening">{scene.error ?? 'Opening the scene…'}</p>}
          stepper={<Stepper current={stage} scene={route.scene} />} />
      </StageSceneProvider>
    </StageRailProvider>
  )
}
