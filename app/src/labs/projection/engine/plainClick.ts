import { Vector2 } from 'three'

/** A press that travels further than this (px) is an orbit drag, not a click. */
const DRAG_PX = 4

/**
 * A click on the view that did not drag: calls `onClick` with the clicked point in normalised device coords, while
 * `enabled()` says so. Under pointer lock (the operator's mouse-look) the cursor has no position, so clicks there are
 * left to the operator. Returns the detach.
 */
export function onPlainClick(dom: HTMLElement, enabled: () => boolean, onClick: (ndc: Vector2) => void): () => void {
  let down: { x: number; y: number } | null = null
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
  const handleClick = (e: MouseEvent) => {
    const start = down
    down = null
    if (!enabled() || document.pointerLockElement === dom) return
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_PX) return
    const r = dom.getBoundingClientRect()
    onClick(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1))
  }
  dom.addEventListener('pointerdown', onDown)
  dom.addEventListener('click', handleClick)
  return () => {
    dom.removeEventListener('pointerdown', onDown)
    dom.removeEventListener('click', handleClick)
  }
}
