// The walk to a spot, shown on the viewport (Walk to a spot gave no feedback: the click set a spot nobody could see). WalkTo
// publishes the walk it holds (her start, the path, the spot) while it is mounted, which is while the person is picked, and the
// armed pick's rubber band (her place to the spot under the mouse) while Walk to a spot is hot; the overlay (walkOverlay.ts)
// draws both in every pane. Module-level, as groundDrawing.ts: the overlay runs in a frame loop outside renders.
import type { Pt } from './panels/blocking/blockingMath'

let shown: readonly Pt[] | null = null

/** WalkTo: the walk's path (her start first, the spot last), or null when there is no walk to show */
export const setWalkMarks = (path: readonly Pt[] | null): void => { shown = path && path.length > 1 ? path : null }

/** the walk to draw now, or null */
export const walkMarks = (): readonly Pt[] | null => shown

/** the armed pick's band: from her place to the spot under the mouse (null while the cursor is off the ground) */
export interface WalkHot {
  from: Pt
  to: Pt | null
}

let hot: WalkHot | null = null

/** WalkTo, while the pick is armed: the band to draw (null disarms it) */
export const setWalkHot = (h: WalkHot | null): void => { hot = h }

/** the band to draw now, or null */
export const walkHot = (): WalkHot | null => hot

// (prop-movement wave) a picked piece's travel paths, drawn by the same overlay as the walk's: `saved` holds what the plan carries
// (the stage shell publishes it from the layer's plan) and `draft` what the armed Move-to-a-spot control is clicking; the draft
// wins while it lives, so the click-by-click path previews before anything is saved.
let savedPaths: readonly (readonly Pt[])[] | null = null
let draftPaths: readonly (readonly Pt[])[] | null = null

/** the stage shell: the travel paths the plan's moving pieces carry (null = draw none) */
export const setSavedPiecePaths = (paths: readonly (readonly Pt[])[] | null): void => { savedPaths = paths && paths.length ? paths : null }

/** the armed Move-to-a-spot control: the path being clicked (null = back to the saved ones) */
export const setDraftPiecePaths = (paths: readonly (readonly Pt[])[] | null): void => { draftPaths = paths && paths.length ? paths : null }

/** the piece travel paths to draw now, or null */
export const piecePaths = (): readonly (readonly Pt[])[] | null => draftPaths ?? savedPaths

/** metres between the samples the path line is drawn through, so it hugs uneven ground in a perspective pane */
const STEP_M = 0.25
/** the spot's ring on the ground, metres */
export const SPOT_RADIUS_M = 0.4

/** the path resampled every STEP_M along each leg (the corners kept), as ground points [x, z] */
export function sampleWalk(path: readonly Pt[]): Pt[] {
  const out: Pt[] = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP_M))
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n])
  }
  return out
}

/** a ring of ground points around `at` (closed: the first point is not repeated) */
export function ringAround(at: Pt, r = SPOT_RADIUS_M, n = 24): Pt[] {
  return Array.from({ length: n }, (_, i) => [at[0] + r * Math.cos((2 * Math.PI * i) / n), at[1] + r * Math.sin((2 * Math.PI * i) / n)] as Pt)
}
