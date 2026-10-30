// Merges every input source into one InputState per frame.
// Axes are summed and clamped; actions are unioned; the most recently active source is reported.
import { DualsenseSource } from './dualsenseSource'
import { GamepadSource } from './gamepadSource'
import { KeyboardMouse } from './keyboardMouse'
import type { InputFrame, InputState, SourceKind } from './types'
import { emptyInput } from './types'

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

/** Pure merge of per-source frames; exported for tests. */
export function mergeFrames(frames: InputFrame[], source: SourceKind): InputState {
  const s = emptyInput()
  s.source = source
  for (const f of frames) {
    if (f.move) {
      s.move.x += f.move.x
      s.move.y += f.move.y
    }
    if (f.look) {
      s.look.x += f.look.x
      s.look.y += f.look.y
    }
    if (f.mouse) {
      s.mouse.x += f.mouse.x
      s.mouse.y += f.mouse.y
    }
    s.lift += f.lift ?? 0
    s.wheel += f.wheel ?? 0
    s.zoomOut = Math.max(s.zoomOut, f.zoomOut ?? 0)
    s.zoomIn = Math.max(s.zoomIn, f.zoomIn ?? 0)
    s.fine ||= f.fine ?? false
    s.scrub += f.scrub ?? 0
    s.gyro = f.gyro ?? s.gyro
    s.gyroRate = f.gyroRate ?? s.gyroRate
    s.touch = f.touch ?? s.touch
    for (const a of f.actions ?? []) s.actions.add(a)
  }
  s.move = { x: clamp1(s.move.x), y: clamp1(s.move.y) }
  s.look = { x: clamp1(s.look.x), y: clamp1(s.look.y) }
  s.lift = clamp1(s.lift)
  return s
}

const isSony = (pad: Gamepad) => /054c/i.test(pad.id) || /dualsense|wireless controller/i.test(pad.id)

export class InputHub {
  readonly keyboard = new KeyboardMouse()
  readonly gamepad = new GamepadSource()
  readonly dualsense = new DualsenseSource()
  private lastSource: SourceKind = 'keyboard'
  /** Latest merged state, for the visualiser. */
  state: InputState = emptyInput()

  poll(dt: number): InputState {
    const frames: InputFrame[] = []
    const kb = this.keyboard.poll(dt)
    frames.push(kb.frame)
    if (kb.active) this.lastSource = 'keyboard'

    const ds = this.dualsense.poll()
    if (ds) {
      frames.push(ds.frame)
      if (hasStickOrButton(ds.frame)) this.lastSource = 'dualsense'
    }
    // When the DualSense is read over WebHID, skip its Gamepad API twin so input isn't doubled.
    const pad = this.gamepad.poll((p) => !!ds && isSony(p))
    if (pad) {
      frames.push(pad.frame)
      if (pad.active) this.lastSource = 'gamepad'
    }
    this.state = mergeFrames(frames, this.lastSource)
    return this.state
  }
}

function hasStickOrButton(f: InputFrame): boolean {
  return (
    (f.actions?.length ?? 0) > 0 ||
    Math.hypot(f.move?.x ?? 0, f.move?.y ?? 0, f.look?.x ?? 0, f.look?.y ?? 0) > 0 ||
    (f.zoomIn ?? 0) > 0 ||
    (f.zoomOut ?? 0) > 0
  )
}
