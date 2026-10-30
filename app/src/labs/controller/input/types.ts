// The normalised input state every source (keyboard/mouse, Gamepad API, DualSense over WebHID)
// is merged into. Rigs read only this; they never know which device produced it.

export type RigId = 'free' | 'dolly' | 'crane' | 'orbit' | 'follow'
export const RIG_IDS: RigId[] = ['free', 'dolly', 'crane', 'orbit', 'follow']

/** Edge-triggered actions (fired once per press). */
export type Action =
  | 'record'
  | 'still'
  | 'smoothing'
  | 'playPause'
  | 'recenter'
  | 'rigNext'
  | 'rigPrev'
  | 'rewind'
  | 'followMode'
  /** let go of a held camera: stop the move or replay, drop the hold, fly free from where it is (Create / Esc) */
  | 'release'
  | CameraAction
  | `rig:${RigId}`

/**
 * The camera's start, the take replay and the aim lock (Set start here / Back to start / Play take / Stop take / clear the aim).
 * The lab has no scene to own them: only a host that sets OperatorEngine.onCameraAction (the Stage) sees them do anything.
 */
export type CameraAction = 'setStart' | 'backToStart' | 'playTake' | 'stopTake' | 'aimClear'

export type SourceKind = 'keyboard' | 'gamepad' | 'dualsense'

export interface Vec2 {
  x: number
  y: number
}

export interface GyroAngles {
  yaw: number
  pitch: number
  roll: number
}

export interface InputState {
  /** The source that last produced meaningful input. */
  source: SourceKind
  /** Left stick / WASD. x = right, y = forward (stick up). -1..1 */
  move: Vec2
  /** Q/E, d-pad up/down. -1..1 */
  lift: number
  /** Right stick / arrow keys. x = right, y = up. -1..1, a rate */
  look: Vec2
  /** Mouse movement this frame, in pixels (pointer lock). */
  mouse: Vec2
  /** Wheel delta this frame (positive = scroll down = zoom out). */
  wheel: number
  /** Triggers: L2 zooms out, R2 zooms in. 0..1 */
  zoomOut: number
  zoomIn: number
  /** Precision modifier (Shift / L3 held). */
  fine: boolean
  /** Controller orientation relative to the last recenter (radians); null without a gyro. */
  gyro: GyroAngles | null
  /** Raw gyro rates, normalised -1..1 of full scale; for the visualiser. */
  gyroRate: { x: number; y: number; z: number } | null
  /** Timeline scrub this frame, in seconds. */
  scrub: number
  /** First touchpad contact, -1..1; for the visualiser. */
  touch: { x: number; y: number } | null
  actions: Set<Action>
}

export function emptyInput(): InputState {
  return {
    source: 'keyboard',
    move: { x: 0, y: 0 },
    lift: 0,
    look: { x: 0, y: 0 },
    mouse: { x: 0, y: 0 },
    wheel: 0,
    zoomOut: 0,
    zoomIn: 0,
    fine: false,
    gyro: null,
    gyroRate: null,
    scrub: 0,
    touch: null,
    actions: new Set(),
  }
}

/** A source's contribution for one frame; the hub sums axes and unions actions. */
export type InputFrame = Partial<Omit<InputState, 'actions' | 'source'>> & { actions?: Action[] }

/** Radial deadzone with rescale, so small stick drift never moves the camera. */
export function deadzone(x: number, y: number, dz = 0.12): Vec2 {
  const m = Math.hypot(x, y)
  if (m < dz) return { x: 0, y: 0 }
  const scaled = Math.min(1, (m - dz) / (1 - dz))
  return { x: (x / m) * scaled, y: (y / m) * scaled }
}

/** Response curve: fine control near centre, full speed at the edge. */
export function expo(v: number, k = 0.6): number {
  return v * (1 - k) + v * Math.abs(v) * k
}
