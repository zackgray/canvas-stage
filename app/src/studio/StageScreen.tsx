import type { useCut } from '../labs/projection/cut'
import type { ProjectionLabState } from '../labs/projection/useProjectionLab'
import type { PaneId } from '../labs/projection/engine/panes'
import type { Stage } from './route'
import { ExportScreen } from './screens/ExportScreen'
import { RenderScreen } from './screens/RenderScreen'
import { StageWorkspace } from './stage/StageWorkspace'

interface Props { stage: Stage; lab: ProjectionLabState; cut: ReturnType<typeof useCut>; panes?: PaneId[]; onPanes?: (on: PaneId[]) => void }

/** The screen for a stage. */
export function StageScreen({ stage, lab, cut, panes, onPanes }: Props) {
  switch (stage) {
    case 'stage': return <StageWorkspace lab={lab} panes={panes} onPanes={onPanes} />
    case 'render': return <RenderScreen lab={lab} />
    case 'export': return <ExportScreen cut={cut} lab={lab} />
  }
}
