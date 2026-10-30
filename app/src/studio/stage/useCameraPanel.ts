// Which panel the right side shows when several panes are up: the Camera's own while the Camera pane is the one the last press
// landed in (Camera alone, or Camera beside the Free / Top View), the set panel while a Free or Top pane was. The engine's own
// answer to "which pane has the keys" (panes.focused) is the same rule: the Camera until a press says otherwise.
import { useEffect, useState } from 'react'
import type { PaneId } from '../../labs/projection/engine/panes'
import type { Stage } from '../../labs/projection/engine/Stage'

export function useCameraPanel(stage: Stage | null | undefined, panes: readonly PaneId[]): boolean {
  const [last, setLast] = useState<PaneId>('camera')
  useEffect(() => {
    const canvas = stage?.renderer.domElement
    if (!stage || !canvas) return
    const down = (e: PointerEvent) => { const p = stage.panes.at(e.clientX, e.clientY); if (p) setLast(p) }
    canvas.addEventListener('pointerdown', down, true)
    return () => canvas.removeEventListener('pointerdown', down, true)
  }, [stage])
  return panes.includes('camera') && (panes.length === 1 || !panes.includes(last) || last === 'camera')
}
