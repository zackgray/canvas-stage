import { useEffect, useRef, useState } from 'react'
import type { Stage } from '../engine/Stage'
import { cameraPose, MotionWatch, pivotOf } from '../engine/viewProbe'
import { poseDeltaDeg } from './angle'

/**
 * Degrees off the projector view (rounded), updated on every camera change; also forwards each change.
 * `active` reports a driver moving the camera right now (the operator), which counts as a change every frame.
 */
export function useViewAngle(stage: Stage | null, onMove: () => void, active: () => boolean = () => false): number {
  const [deg, setDeg] = useState(0)
  const cb = useRef(onMove)
  const live = useRef(active)
  useEffect(() => { cb.current = onMove; live.current = active })
  useEffect(() => {
    if (!stage) return
    const w = new MotionWatch(stage.view, () => {
      setDeg(Math.round(poseDeltaDeg(cameraPose(stage.projector), cameraPose(stage.view), pivotOf(stage))))
      cb.current()
    }, () => live.current())
    return () => w.dispose()
  }, [stage])
  return deg
}
