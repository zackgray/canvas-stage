/**
 * The motion library: CMU clips shipped under public/mocap/cmu (see its README for credit and the original frame ranges of cropped
 * files) and generated clips under public/mocap/kimodo (its README: generator, licence, credit), already on subject 35's skeleton.
 * Times are seconds in the shipped file. Every clip is retargeted onto subject 35's skeleton (motion/retarget.ts).
 *
 * root:
 *  - 'loop'     travelling gait played in place: the root's straight-line travel over [in, out] is stripped and the anchor walks the
 *               path at that speed × pace; [in, out] is one seamless cycle (picked by pose matching).
 *  - 'progress' a one-shot that starts or ends travel (start, stop): the root's smoothed forward progress drives the anchor.
 *  - 'pinned'   stationary (idle, turn, kneel): the body keeps the clip's own small root drift from where the last clip left it.
 */
export type ClipRoot = 'loop' | 'progress' | 'pinned'
/** what the body looks like from clip time `from` on, in a still prompt's words (the pose at a frame, not the whole action) */
export type ClipPhase = { from: number; words: string }
export type ClipDef = {
  url: string
  /** where the clip came from: a CMU subject_trial, or the generator and run of a generated clip (see its folder's README) */
  source: { cmu: string } | { generated: string }
  note: string
  root: ClipRoot
  in: number
  out: number
  /** progress clips that end travel: the window of entry times (walking) the timeline may pick from to match the gait's phase */
  enter?: [number, number]
  /** has flight phases (both feet off the ground): keep one floor instead of pinning the lowest foot to it every frame */
  flight?: boolean
  /** kneel: the held window between going down and standing up (looped if the hold is longer) */
  hold?: [number, number]
  /** loop clips: scale each upper arm's swing about its mean carriage over the cycle (1 = as captured; the source walk's arms barely swing) */
  armSwing?: number
  /** the pose in words by clip time, in order (a still at a frame says the phase it is in; motion/phase.ts) */
  phases?: ClipPhase[]
  /** a prop the hands carry in this clip: taken at clip time `grab` (unset = held from the start), let go at `release` (unset = kept).
   *  (track D) kind 'frame' draws the frame model; any other kind (a made move's object) draws a plain clay block sized to the grip */
  prop?: { kind?: string; grab?: number; release?: number }
}

export type ClipId = 'walk' | 'run' | 'start' | 'stop' | 'idle' | 'turnLeft' | 'turnRight' | 'kneel' | 'lift' | 'liftDown'
/** (track D, live motion) a kept user move's clip id: gen:<motion-id>, the folder under public/lab-assets/motions */
export type GenClipId = `gen:${string}`

const cmu = (trial: string) => ({ url: `/mocap/cmu/${trial}.bvh`, source: { cmu: trial } })
const kimodo = (file: string, run: string) => ({ url: `/mocap/kimodo/${file}.bvh`, source: { generated: `kimodo:${run}` } })

export const CLIPS: Record<ClipId, ClipDef> = {
  walk: { ...cmu('35_01'), note: 'walk; one gait cycle 1.16 s, 1.47 m', root: 'loop', armSwing: 2, in: 0.333, out: 1.492 },
  run: { ...cmu('35_17'), note: 'run/jog; one cycle 0.74 s, 2.34 m', root: 'loop', flight: true, armSwing: 1.5, in: 0.267, out: 1.008 },
  start: { ...cmu('16_32'), note: 'stand, start walking (to full stride)', root: 'progress', in: 0.15, out: 1.9 },
  stop: { ...cmu('16_34'), note: 'slow walk to a stop and stand', root: 'progress', in: 0.15, out: 2.85, enter: [0.15, 0.75] },
  idle: { ...cmu('111_28'), note: 'standing still, head up, quiet sway; 2 s seamless cycle', root: 'pinned', in: 0.333, out: 2.333 },
  turnLeft: { ...cmu('76_10'), note: 'turn in place to the left (~70°), scaled to the asked angle', root: 'pinned', in: 0.04, out: 1.54 },
  turnRight: { ...cmu('76_10'), note: 'turn in place to the right (~90°), scaled to the asked angle', root: 'pinned', in: 1.99, out: 4.24 },
  kneel: { ...cmu('23_03'), note: 'step in, kneel on the right knee, hold, stand up', root: 'pinned', in: 0.04, out: 5.49, hold: [1.99, 4.04],
    phases: [{ from: 0, words: 'going down on one knee' }, { from: 1.99, words: 'kneeling' }, { from: 4.04, words: 'getting up from one knee' }] },
  // the lift: stands, bends to the box in front, takes a frame with both hands at its rim (2.5 s), raises it to head height, holds
  lift: { ...kimodo('lift_frame', 'c15'), note: 'lift something from the piece in front with both hands and hold it up at head height', root: 'pinned', in: 1.0, out: 7.95, hold: [4.5, 7.95],
    prop: { kind: 'frame', grab: 2.5 },
    phases: [{ from: 0, words: 'standing at the piece in front of them, both hands empty' }, { from: 1.3, words: 'bending over the piece in front of them, reaching into it with both hands, the hands still empty' },
      { from: 2.5, words: 'lifting something out of the piece in front of them with both hands' }, { from: 4.3, words: 'holding something up at head height in both hands, looking at it' }] },
  // the lift's ending, generated to start on the lift's last pose: lowers the frame back into the hive, lets go (2.85 s), stands
  liftDown: { ...kimodo('lift_frame_lower', 'd02'), note: 'lower it back into the piece in front, let go and stand', root: 'pinned', in: 0, out: 4.2,
    prop: { kind: 'frame', release: 2.85 },
    phases: [{ from: 0, words: 'holding something up at head height in both hands' }, { from: 0.5, words: 'lowering something back into the piece in front of them with both hands' },
      { from: 2.85, words: 'straightening up from the piece in front of them, both hands empty' }, { from: 3.5, words: 'standing at the piece in front of them, both hands empty' }] },
}

/** the clip that plays a gait */
export const GAIT: Record<'walk' | 'run', ClipId> = { walk: 'walk', run: 'run' }

/** the canonical skeleton's source (subject 35, the spike's figure) */
export const CANON_URL = CLIPS.walk.url
