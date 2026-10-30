// The Stage's half of Create / Esc, "let go of the held camera" (owner 2026-10-28: both thumbs stay on the sticks, so no hand goes to
// Esc to get the camera back). The engine's release (actions.ts) asks the Stage first: the Hold tick lives in the Stage's scene memory
// (stageMemory.ts), not in the engine, and a move playing or filming is stopped where the camera is now, not sent back to its
// frame 0 as Stop does. The engine then frees the rig and flashes what happened. useShotPlan registers both for the Stage's life.
import type { StageOperatorEngine } from '../../labs/projection/operator/stageEngine'
import { isGroundDrawing } from './groundDrawing'
import { setStageMemo, stageMemo } from './stageMemory'

/** Untick Hold on and stop a running move with the camera left where it is; returns whether anything was held. */
export function releaseShot(engine: StageOperatorEngine): boolean {
  const held = stageMemo().hold
  if (held) setStageMemo({ hold: false })
  if (!engine.move) return held
  const o = engine.out
  const at = { position: o.position.clone(), quaternion: o.quaternion.clone(), focal: o.focal }
  engine.stopPreset() // a filming move keeps what was filmed, as its Stop does
  engine.takeOver(at.position, at.quaternion, at.focal)
  return true
}

/**
 * Whether an Escape pressed now is the camera's: not while Blocking draws or a walk spot is armed (Esc ends the draw), nor while
 * the render or the first frame lies over the viewport or a pick menu is open (Esc closes it). These close on Escape without
 * claiming it; the rail's screens, the lightbox and the asks claim it themselves.
 */
export const stageEscapeFree = (): boolean =>
  !isGroundDrawing() && !document.querySelector('.st-hero-overlay, .st-addmenu')
