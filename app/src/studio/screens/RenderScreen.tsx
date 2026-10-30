import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { L2RBlock } from '../render/L2RBlock'
import { useL2R } from '../render/l2rModel'
import { RenderViewer } from './RenderViewer'

/**
 * Render: the shots page — one Layout-To-Render pass of a locked take's result (its clay as the layout, its approved hero still as
 * the look), played here Finished / Raw, then Export on the strip. The paid press is in the Stage's steps block: it lives
 * with the viewport the render lands over, and this page is never mounted with the Stage, so the press exists in one place only.
 */
export function RenderScreen({ lab }: { lab: ProjectionLabState }) {
  const l = useL2R(lab.s.source) // only the world on the set's locked takes
  return (
    <div className="st-two" data-testid="page-render">
      <section className="st-pane st-controls">
        <h1>Render</h1>
        <L2RBlock lab={lab} />
      </section>
      <section className="st-pane st-result"><RenderViewer l={l} /></section>
    </div>
  )
}
