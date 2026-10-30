import type { ReactNode } from 'react'
import type { Stage } from './route'
import { creditLine } from './stageCopy'
import { PromptDrawer } from './stage/PromptDrawer'

interface Props {
  stage: Stage
  projectName: string | null
  /** the one lab viewport: mounted on every stage (so the Stage is never torn down), visible on the Stage stage */
  viewport: ReactNode
  screen: ReactNode
  /** the bottom transport row (the Stage's draw bar), a full-width line under the stage slot; absent on the other stages */
  transport?: ReactNode
  /** the stepper row above the stage (Home · Stage · Render · Export) */
  stepper?: ReactNode
  /** replaces the project name when the scene's own name is shown (editable in place) */
  title?: ReactNode
  /** the words drawer under the viewport, on the Stage only (default: the open scene's, PromptDrawer) */
  drawer?: ReactNode
}

/**
 * The studio's frame: the top bar (the app title and the scene's name), the body and one small "Built on …" credit line at the
 * very bottom (the contest requires it). Hook-free on purpose: the stage slot is the body's FIRST child under one key, so a stage
 * switch never remounts it. On the Stage the slot is a grid (screens.css): the viewport over the words drawer in the left column,
 * the screen's panel the full height of the right one.
 */
export function StudioView({ stage, projectName, viewport, screen, transport, stepper, title, drawer = <PromptDrawer /> }: Props) {
  const vpOn = stage === 'stage'
  return (
    <div className="st-root st-app" data-testid="studio-root">
      <header className="st-bar">
        <div className="st-bar-left">
          <span className="st-brand">Canvas Stage</span>
          {title ?? <span className="st-proj" data-testid="studio-project">{projectName ?? 'Untitled project'}</span>}
        </div>
      </header>
      {stepper && <div className="st-steps-row">{stepper}</div>}
      <div className="st-body">
        {/* one key for every stage: the viewport (the 3D canvas lives in it) is never remounted, so coming back shows the live set */}
        <main key="stage" className={`st-stage${vpOn ? ' st-stage-on' : ''}`} data-testid="studio-stage">
          <div className={`st-vp${vpOn ? ' st-vp-on' : ''}`} aria-hidden={!vpOn} data-testid="studio-viewport">{viewport}</div>
          <div key={stage} className={`st-screen st-screen-${stage}`} data-testid="studio-screen">{screen}</div>
          {vpOn && drawer}
        </main>
        {transport}
      </div>
      <footer className="st-foot" data-testid="stage-credit">
        <span className="st-built-on" data-testid="stage-built-on">{creditLine(stage)}</span>
      </footer>
    </div>
  )
}
