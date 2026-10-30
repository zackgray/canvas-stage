import { useEffect, useRef, type ReactNode } from 'react'
import type { Stage } from '../engine/Stage'

/**
 * A box laid exactly on the Camera pane's picture (the export frame inside its slot, panes.ts), so what rides the Camera — the
 * viewfinder's thirds and readouts — sits in that pane alone and never crosses into the Free view or the
 * Top View beside it. Re-placed every frame (the pane split and the canvas size change under it); no stage yet fills the viewport.
 */
export function CameraPaneBox({ stage, children }: { stage: Stage | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const place = () => {
      raf = requestAnimationFrame(place)
      const el = ref.current, canvas = stage?.renderer.domElement
      if (!el || !canvas) return
      const r = stage.panes.rect('camera', canvas.clientWidth || 1, canvas.clientHeight || 1)
      el.style.display = r ? '' : 'none'
      if (!r) return
      el.style.left = `${canvas.offsetLeft + r.x}px`
      el.style.top = `${canvas.offsetTop + r.y}px`
      el.style.width = `${r.w}px`
      el.style.height = `${r.h}px`
    }
    place()
    return () => cancelAnimationFrame(raf)
  }, [stage])
  return <div ref={ref} data-testid="camera-pane-box" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{children}</div>
}
