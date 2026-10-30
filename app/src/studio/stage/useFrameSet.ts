// Frame the Free view and Top View on the whole set, once per scene on a page visit, when a piece lies beyond their default view
// (the planner stands a prop on a stand-in 25-35 m away; the plan opened on the performer's corner and showed nothing). Sets that fit
// the default framing keep it, and a view the owner already steered is never pulled back (one framing per scene and visit).
import { useEffect } from 'react'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { markOf } from '../../stage3d/mark'
import { setBounds } from './setBounds'

/** a set whose farthest point from the middle of its spread is within this fits the default views */
export const FITS_M = 10
const framed = new Set<string>()
/** tests only */
export const resetFrameSet = () => framed.clear()

export function useFrameSet(lab: ProjectionLabState): void {
  const world = lab.kit?.world ?? null
  const stage = lab.stage
  useEffect(() => {
    if (!world || !stage || framed.has(world.id)) return
    framed.add(world.id)
    const b = setBounds(world.plan.kit, markOf(world.plan).at)
    if (b.radius > FITS_M) stage.panes.frameSet(b.cx, b.cz, b.radius)
  }, [world, stage])
}
