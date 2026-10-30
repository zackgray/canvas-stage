import type { ReactNode } from 'react'
import { HeroOverlay } from '../../../studio/shoot/HeroOverlay'
import type { ProjectionLabState } from '../useProjectionLab'
import { AngleBadge } from './AngleBadge'
import { CameraPaneBox } from './CameraPaneBox'
import { OperatorHud } from './OperatorHud'

/** The stage's viewport: the Stage's canvas lands in `host`, with the angle badge (projected stills only: a kit world is built in 3D, so it has no "turned away" to warn of) and the operator's viewfinder over it, and the hero still awaiting approval over the clay (HeroOverlay). `children` ride the viewport too — the Stage floats its option rail here and mounts the render overlay (never unmounting the canvas). */
export function LabViewport({ lab, children, camera = true }: { lab: ProjectionLabState; children?: ReactNode
  /** the Camera pane is on: the operator's viewfinder and hint are the Camera's, so they show only then */
  camera?: boolean }) {
  const { host } = lab
  const op = lab.op
  const driving = op.mode === 'operator' && camera
  return (
    <div className="pl-viewport" ref={host}>
      {!lab.kit?.id && <AngleBadge deg={lab.angle} />}
      {driving && <CameraPaneBox stage={lab.stage}>
        <OperatorHud engine={op.engine} />
      </CameraPaneBox>}
      {/* (owner 10-29) the first-frame window covers the whole viewport while it is open: it holds the look and the render now, so
          it takes the room (review F7 laid the bare still on the Camera pane; the window opens only when asked and closes with X / Esc) */}
      <HeroOverlay lab={lab} />
      {children}
    </div>
  )
}
