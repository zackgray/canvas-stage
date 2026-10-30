// Where the Stage's panes sit on the one canvas (split out of panes.ts): side-by-side slots in a fixed order, and the Camera's
// picture fitted to the export frame inside its slot (the rest of the slot is black bars). Pure: no camera, no renderer.

export type PaneId = 'camera' | 'free' | 'top'
/** a pane's rectangle over the canvas: css px, y down from the canvas' top-left */
export interface PaneRect { x: number; y: number; w: number; h: number }

/** the order panes split in (the Camera leads; the Top View takes the last slot) */
export const ORDER: readonly PaneId[] = ['camera', 'free', 'top']

/** the export frame's w/h (1920x1088): the Camera pane shows exactly this, so the take records it and the export crops nothing */
export const EXPORT_ASPECT = 1920 / 1088

/** the largest rectangle of aspect w/h centred in `r` (whole pixels) */
export function fitAspect(r: PaneRect, aspect: number): PaneRect {
  const w = Math.min(r.w, Math.round(r.h * aspect)), h = Math.min(r.h, Math.round(r.w / aspect))
  return { x: r.x + Math.round((r.w - w) / 2), y: r.y + Math.round((r.h - h) / 2), w, h }
}

/** the panes' whole slots over a w×h canvas, in draw order: one fills it, two split it in halves, three put the first on the left */
export function paneSlots(on: readonly PaneId[], w: number, h: number): { pane: PaneId; rect: PaneRect }[] {
  if (on.length === 1) return [{ pane: on[0], rect: { x: 0, y: 0, w, h } }]
  const half = Math.round(w / 2)
  if (on.length === 2) {
    return [
      { pane: on[0], rect: { x: 0, y: 0, w: half, h } },
      { pane: on[1], rect: { x: half, y: 0, w: w - half, h } },
    ]
  }
  // all three: the Camera keeps the left half; Free and Top stack on the right
  const mid = Math.round(h / 2)
  return [
    { pane: on[0], rect: { x: 0, y: 0, w: half, h } },
    { pane: on[1], rect: { x: half, y: 0, w: w - half, h: mid } },
    { pane: on[2], rect: { x: half, y: mid, w: w - half, h: h - mid } },
  ]
}
