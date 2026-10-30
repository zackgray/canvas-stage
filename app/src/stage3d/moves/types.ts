/**
 * The move spec: the one record the app sends the motion computer for one made move (plan-kimodo-live.md section 2; the box
 * contract names this file as the MoveSpec shape). Built by the pure functions in this folder from the user's words and the
 * measured piece; the box only turns `keys` into wrist constraints, so no product logic lives past this point.
 * Coordinates are performer-local, in the spike's convention: Y up, the figure at the origin facing +Z, left = +X, metres.
 */
export type MoveClass = 'takeOut' | 'pickUp' | 'putDown' | 'holdUp' | 'gesture'

export type Vec3 = [number, number, number]
export type HandSide = 'Left' | 'Right'

/** the base pose a key asks the box to start its IK from; the box keeps a small bank of generated poses, one per name */
export type BasePose = 'reach-low' | 'hold-chest' | 'hold-high' | 'stand'

/** one hand-target frame: both wrists at ±grip/2 in x, at the height/depth the class schedule asks */
export type MoveKey = { frame: number; hands: Record<HandSide, Vec3>; pose: BasePose }

/** the pose at `from` seconds on, in a still prompt's words (the same shape as the library clips' ClipPhase) */
export type MovePhase = { from: number; words: string }

/** what the picked piece is to this move: a container is reached into, a surface or floor is picked from or put on */
export type PropKind = 'container' | 'surface' | 'floor' | 'held'

/** the measured piece, in the performer's frame: `front` hips→near face, `rimOrTop` top height, `width`/`side` the top's sizes */
export type MoveProp = {
  /** the Set piece this move names, when there is one (suppresses a second copy of the piece at playback) */
  pieceId?: string
  kind: PropKind
  width: number
  rimOrTop: number
  front: number
  side: number
}

export type MoveSpec = {
  class: MoveClass
  /** the sentence the generator reads, in the "A person stands still, then …" caption style (sentence.ts) */
  sentence: string
  /** the window's length, seconds (≤ 10; frames = seconds × 30 on the box) */
  seconds: number
  /** hand targets per class schedule; empty for gestures (text only, nothing to drift) */
  keys: MoveKey[]
  /** seconds at which the hands take the object (unset = held from the start) */
  grab?: number
  /** seconds at which the hands let go (unset = kept) */
  release?: number
  /** the held window [from, to] seconds, looped by a longer hold like the kneel clip's */
  hold?: [number, number]
  phases: MovePhase[]
  prop?: MoveProp
}
