// The panes' frames over the viewport: a thin outline on the Camera's picture, which Panes fits to the 1920x1088 export frame (the
// black bars around it are outside the picture), so what the owner frames is exactly what gets drawn; and, while the viewport is
// split, each pane's own frame with its name in the corner, the pane the last press landed in lit (its controls answer the keys
// and the mouse), so two panes side by side read as two viewports and never as one picture laid over another. Re-placed every
// frame (the pane split and the canvas size change under it); never takes a press. While the Camera holds the mouse (a click in
// it to fly) a small tag at the top of its frame says how to let go: Esc, or the controller's Create (the engine's 'release').
import { useEffect, useRef } from 'react'
import type { PaneId } from '../../labs/projection/engine/panes'
import type { Stage } from '../../labs/projection/engine/Stage'
import { PANE_LABELS } from './ViewSwitch'
import './stagePanes.css'

const PANES: readonly PaneId[] = ['camera', 'free', 'top']

/** the controller button that lets go of the held camera (input/dualsenseSource.ts, gamepadSource.ts: 'release') */
export const RELEASE_HINT = 'Esc to release · Create on the controller'

const place = (el: HTMLElement, r: { x: number; y: number; w: number; h: number } | null, canvas: HTMLCanvasElement) => {
  el.style.display = r ? '' : 'none'
  if (!r) return
  el.style.left = `${canvas.offsetLeft + r.x}px`; el.style.top = `${canvas.offsetTop + r.y}px`
  el.style.width = `${r.w}px`; el.style.height = `${r.h}px`
}

export function FrameGuide({ stage }: { stage: Stage | null }) {
  const guide = useRef<HTMLDivElement>(null)
  const hold = useRef<HTMLDivElement>(null)
  const frames = useRef<Partial<Record<PaneId, HTMLDivElement | null>>>({})
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const canvas = stage?.renderer.domElement
      if (!stage || !canvas || !guide.current) return
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1
      const cam = stage.panes.rect('camera', w, h)
      place(guide.current, cam, canvas)
      if (hold.current) place(hold.current, document.pointerLockElement === canvas ? cam : null, canvas) // the mouse is the Camera's
      const split = stage.panes.split(), focused = stage.panes.focused
      for (const p of PANES) {
        const el = frames.current[p]
        if (!el) continue
        place(el, split ? stage.panes.slot(p, w, h) : null, canvas)
        el.classList.toggle('st-pane-frame-on', p === focused)
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [stage])
  return (
    <>
      <div className="st-frame-guide" ref={guide} data-testid="stage-frame-guide" style={{ display: 'none' }} />
      <div className="st-pane-hold" ref={hold} style={{ display: 'none' }}>
        <span className="st-pane-hold-tag" role="status" data-testid="camera-release-hint">{RELEASE_HINT}</span>
      </div>
      {PANES.map((p) => (
        <div key={p} className="st-pane-frame" ref={(el) => { frames.current[p] = el }} data-testid={`stage-pane-frame-${p}`} style={{ display: 'none' }}>
          <span className="st-pane-name">{PANE_LABELS[p]}</span>
        </div>
      ))}
    </>
  )
}
