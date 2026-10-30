// The take the owner works on for a world (the scene's set): the one Render, Export and the Stage's render overlay read. Picked on
// Render's shots list, or set by a lock on the Stage; remembered per world in this browser, like the draw-mode choice
// (useDrawMode.ts), so a reload or a scene switch comes back on the same take instead of another one.
const KEY = 'canvas-stage.render-take'

/** the stored pick for the world, or null (none yet, no world, storage off) */
export function readTakePick(worldId: string | null | undefined): string | null {
  if (!worldId) return null
  try { return localStorage.getItem(`${KEY}.${worldId}`) } catch { return null }
}

export function writeTakePick(worldId: string | null | undefined, takeId: string | null): void {
  if (!worldId || !takeId) return
  try { localStorage.setItem(`${KEY}.${worldId}`, takeId) } catch { /* storage off: this page only */ }
}
