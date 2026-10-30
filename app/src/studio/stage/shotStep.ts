// The Stage's one next step (the Stage simplification, pass 3; the first-run flow adds one before Record): Write your scene →
// Place things yourself → Record → Lock take → Draw the first frame → pick a version (owner 10-29: no Approve press; a lone fresh
// version is picked by itself) → Render clip. (hide-set-build) The planner's lay-out
// step is switched off — the 'layout' step still names an empty world with no chosen way forward, but its cue points at placing
// things by hand. Exactly one of these is the yellow press at a time; the others stay quiet. Pure, so it is unit-tested.
import { KIT_NEEDS_TAKE, type Primary } from '../screens/primaryAction'

export type ShotStep = 'words' | 'layout' | 'record' | 'lock' | 'draw' | 'approve' | 'render'

export interface ShotFacts {
  /** the scene has words (the first-words card has done its job) */
  words: boolean
  /** the world has placed pieces */
  placed: boolean
  /** the owner chose a way forward on an empty world ("Lay it out for me" or "place things myself") */
  chosen: boolean
  /** a take is locked and current (the Camera panel says "Take locked.") */
  locked: boolean
  /** a take is recorded in memory and not locked yet (or changed since its lock) */
  unlocked: boolean
  /** the take's first frame: none drawn, one waiting for approval, or approved */
  still: 'none' | 'awaiting' | 'approved'
}

export function shotStep(f: ShotFacts): ShotStep {
  if (!f.words) return 'words'
  if (!f.placed && !f.chosen) return 'layout'
  if (f.unlocked) return 'lock'
  if (!f.locked) return 'record'
  if (f.still === 'none') return 'draw'
  if (f.still === 'awaiting') return 'approve'
  return 'render'
}

/** the one line under the yellow press: what comes next. `cameraView`: the Record / Lock presses are on screen */
export function stepCue(step: ShotStep, cameraView: boolean): string {
  switch (step) {
    case 'words': return 'Next: write your prompt in the Prompt box under the stage.'
    case 'layout': return 'Next: place things yourself on the Stage.'
    case 'record': return cameraView ? 'Next: record the shot.' : 'Next: record the shot in the Camera view.'
    case 'lock': return cameraView ? 'Next: lock the take to keep it.' : 'Next: lock the take in the Camera view.'
    case 'draw': return 'Next: draw the first frame, beside the Prompt box.'
    case 'approve': return 'Next: open the first frame and pick a version.'
    case 'render': return 'Next: open the first frame and press Render clip.'
  }
}

/**
 * The Stage's Render reads the take the Camera panel reads: with no locked take there ("Take locked." absent: a fresh recording
 * not locked yet, or the take changed since its lock), Render says to lock one, whatever older take is on disk.
 */
export function stageGate(p: Primary, current: string | null, renderTake: string | null): Primary {
  if (current && current === renderTake) return p
  return { ...p, action: 'needs-take', verb: 'Render', price: null, disabled: true, why: KIT_NEEDS_TAKE, run: () => {} }
}
