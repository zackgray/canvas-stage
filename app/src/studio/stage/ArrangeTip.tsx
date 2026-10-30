// The arranging tip (layout wave L4; W3-E2 words): the small dismissible pill in the top-right of the viewport's large pane —
// "Click anything to change it · right-click for its menu" — the mock's .tip style (the same pill the Camera pane's hint uses).
// Dismissed for the session (sessionStorage, never persisted). Its ✕ is the pill's own press: the pick pipeline only answers
// events whose target is the canvas (useStagePick's onDown/onCtx guard), so dismissing never marks a spot. The pill shows
// whenever a Free or Top pane is on and sits in the first of them, never in the Camera pane, where the Camera's own hint
// shows in the same corner, so the two pills never overlap.
import { useEffect, useRef, useState } from 'react'
import type { Stage } from '../../labs/projection/engine/Stage'
import { FrameGuide } from './FrameGuide'

const KEY = 'canvas-stage.arrangeTip'
const dismissed = () => {
  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}

export function ArrangeTip({ stage, show }: { stage: Stage | null; show: boolean }) {
  const [gone, setGone] = useState(dismissed)
  const [, tick] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  // the pane split and the canvas size change under a mounted pill: re-place it a few times a second (cheap, hidden work
  // when arranging is off)
  useEffect(() => {
    if (gone || !show) return
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [gone, show])
  // the top-right corner of the first arranging pane (Free or Top); no stage yet hides it
  useEffect(() => {
    const el = ref.current, canvas = stage?.renderer.domElement
    if (!el || !stage || !canvas) return
    const pane = stage.panes.active.find((p) => p !== 'camera')
    const rect = pane && stage.panes.rect(pane, canvas.clientWidth || 1, canvas.clientHeight || 1)
    if (!rect) { el.style.display = 'none'; return }
    el.style.display = ''
    el.style.left = `${rect.x + rect.w - el.offsetWidth - 8}px`
    el.style.top = `${rect.y + 6}px`
  })
  return (
    <>
    <FrameGuide stage={stage} />
    {!gone && show && <div className="pl-tip" ref={ref} data-testid="stage-tip">
      Click anything to change it · right-click for its menu
      <button type="button" data-testid="stage-tip-dismiss" title="Dismiss"
        onClick={() => { try { sessionStorage.setItem(KEY, '1') } catch { /* the pill just stays gone this visit */ } setGone(true) }}>✕</button>
    </div>}
    </>
  )
}
