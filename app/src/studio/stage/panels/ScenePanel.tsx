// The Scene panel (merge step 6a; the Stage simplification): the panel host's nothing-picked route. In the Camera view (the
// Camera pane alone) it is the Camera panel (shot length, camera moves, Hold on, Preview, Record, Lock take); in Free view / Top
// plan it is the set panel (SetPanel: the set's approval and Reset the set).
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { KitBuildDeps } from '../../kit/useKitBuild'
import type { BibleApi } from '../../scene/bibleApi'
import type { PiecesApi } from '../../scene/piecesApi'
import type { SetPlaceState } from '../../scene/useSetPlace'
import type { StagePick } from '../useStagePick'
import { CameraPanel } from './CameraPanel'
import { SetPanel } from './SetPanel'

export interface ScenePanelProps {
  lab: ProjectionLabState
  /** the Bible routes and the kit build's steps, as the Scene screen's set screen takes them (production defaults) */
  api?: BibleApi
  kit?: KitBuildDeps
  /** the Camera view (the Camera pane alone): the Camera panel; never Approve the set */
  cameraView?: boolean
  /** tests: the set panel's pieces read (jsdom has no route) */
  pieces?: PiecesApi
  /** the Find list's selection (Free view / Top View): picks a piece, or brings it near the performer */
  place?: SetPlaceState
  select?: (p: StagePick | null) => void
}

/** nothing picked: the Camera panel in the Camera view; the set panel in Free view and Top View */
export function ScenePanel({ lab, api, kit, cameraView, pieces, place, select }: ScenePanelProps) {
  return cameraView ? <CameraPanel lab={lab} /> : <SetPanel lab={lab} api={api} kit={kit} pieces={pieces} place={place} select={select} />
}
