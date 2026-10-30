// Any controller through the browser Gamepad API ("standard" mapping: Xbox, DualSense, etc.).
import type { Action, InputFrame } from './types'
import { deadzone } from './types'

/** Standard-mapping button index -> edge action. */
const BUTTON_ACTIONS: Record<number, Action> = {
  0: 'still', // Cross / A
  1: 'followMode', // Circle / B
  2: 'record', // Square / X
  3: 'playPause', // Triangle / Y
  8: 'release', // Create / View
  9: 'smoothing', // Options / Menu
  11: 'recenter', // R3
  14: 'rigPrev', // d-pad left
  15: 'rigNext', // d-pad right
  16: 'playTake', // PS / home (the DualSense's PS button over WebHID too)
}

export interface PadInfo {
  id: string
  mapping: string
}

export class GamepadSource {
  private prev: boolean[] = []
  /** the pad `prev` belongs to: a new pad starts clean, a dropped one keeps its edges (a reconnect still held never re-fires) */
  private seen = ''
  info: PadInfo | null = null

  poll(ignore: (pad: Gamepad) => boolean): { frame: InputFrame; active: boolean } | null {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const pad = Array.from(pads).find((p): p is Gamepad => !!p && p.connected && !ignore(p))
    if (!pad) {
      this.info = null
      return null
    }
    if (pad.id !== this.seen) {
      this.seen = pad.id
      this.prev = []
    }
    this.info = { id: pad.id, mapping: pad.mapping || '(non-standard)' }
    const btn = (i: number) => pad.buttons[i]?.pressed ?? false
    const val = (i: number) => pad.buttons[i]?.value ?? 0
    const ax = (i: number) => pad.axes[i] ?? 0

    const actions: Action[] = []
    pad.buttons.forEach((b, i) => {
      const action = BUTTON_ACTIONS[i]
      if (action && b.pressed && !this.prev[i]) actions.push(action)
    })
    this.prev = pad.buttons.map((b) => b.pressed)

    const left = deadzone(ax(0), -ax(1))
    const right = deadzone(ax(2), -ax(3))
    const trig = (v: number) => (v < 0.04 ? 0 : v)
    const frame: InputFrame = {
      move: left,
      look: right,
      lift: (btn(12) ? 1 : 0) - (btn(13) ? 1 : 0),
      zoomOut: trig(val(6)),
      zoomIn: trig(val(7)),
      fine: btn(10),
      actions,
    }
    const active =
      actions.length > 0 ||
      Math.hypot(left.x, left.y, right.x, right.y) > 0 ||
      pad.buttons.some((b) => b.pressed)
    return { frame, active }
  }
}
