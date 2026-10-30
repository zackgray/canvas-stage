import { useEffect, useRef, useState } from 'react'
import type { Stage } from '../engine/Stage'
import { SplatView, type SplatStats, type SplatViewOptions, type ViewMode } from './SplatView'

/** The View choice on the stage: one SplatView per stage, mode and options pushed in as they change. */
export function useSplatView(stage: Stage | null, mode: ViewMode, opts: SplatViewOptions): SplatStats | null {
  const [stats, setStats] = useState<SplatStats | null>(null)
  const { stride, edgeThreshold, planeAware, sharpen } = opts
  const latest = useRef({ mode, opts: { stride, edgeThreshold, planeAware, sharpen } })
  useEffect(() => { latest.current = { mode, opts: { stride, edgeThreshold, planeAware, sharpen } } })
  const view = useRef<SplatView | null>(null)

  useEffect(() => {
    if (!stage) return
    const v = new SplatView(stage, latest.current.opts, setStats)
    v.setMode(latest.current.mode)
    view.current = v
    return () => { v.dispose(); view.current = null }
  }, [stage])
  useEffect(() => { view.current?.setOptions({ stride, edgeThreshold, planeAware, sharpen }) }, [stride, edgeThreshold, planeAware, sharpen])
  useEffect(() => { view.current?.setMode(mode) }, [mode])
  return stats
}
