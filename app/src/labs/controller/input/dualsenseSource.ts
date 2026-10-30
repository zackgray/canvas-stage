// PS5 DualSense over WebHID (dualsense-ts): sticks, triggers, buttons, touchpad and the fused
// gyro orientation. Chrome/Edge only; the first connection needs a user gesture (button click).
import { Dualsense, WebHIDProvider } from 'dualsense-ts'
import type { Action, GyroAngles, InputFrame } from './types'
import { deadzone } from './types'
import { wrapAngle } from '../math/spring'

export type DualsenseStatus = 'unsupported' | 'idle' | 'waiting' | 'connected' | 'error'

const SONY_VENDOR = 0x054c

export function webHidSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator
}

export class DualsenseSource {
  private ds: Dualsense | null = null
  private prev: Record<string, boolean> = {}
  private ref: GyroAngles = { yaw: 0, pitch: 0, roll: 0 }
  private lastTouchX: number | null = null
  /** The Dualsense autoConnect already handed a device to. */
  private autoAttached: Dualsense | null = null
  status: DualsenseStatus = webHidSupported() ? 'idle' : 'unsupported'
  error = ''
  /** Flip gyro axes if the controller turns the camera the wrong way. */
  invertYaw = false
  invertPitch = false

  get connected(): boolean {
    return !!this.ds && this.ds.connection.state
  }

  get label(): string {
    if (!this.ds || !this.connected) return ''
    return `${this.ds.wireless ? 'Bluetooth' : 'USB'}`
  }

  private ensure(): Dualsense {
    if (!this.ds) {
      this.ds = new Dualsense()
      this.ds.hid.provider.onError = (err: Error) => {
        this.error = err.message
      }
      this.ds.connection.on('change', () => {
        this.status = this.ds?.connection.state ? 'connected' : 'waiting'
        this.recenter()
      })
    }
    return this.ds
  }

  /**
   * Reconnect silently to a controller the user already granted (an earlier session, or before a page switch
   * re-attached the engine). The library's provider only attaches on a picker choice or a physical plug-in event,
   * so an already-present, already-permitted pad has to be handed to it here.
   */
  async autoConnect(): Promise<void> {
    if (!webHidSupported()) return
    const devices = (await WebHIDProvider.enumerate()).filter((d) => d.vendorId === SONY_VENDOR)
    if (devices.length === 0) return
    const ds = this.ensure()
    const provider = ds.hid.provider
    // one attach per Dualsense: a second listener on the same device would decode every report twice
    if (provider instanceof WebHIDProvider && !provider.connected && this.autoAttached !== ds) {
      this.autoAttached = ds
      provider.attach(devices[0])
    }
    this.status = this.connected ? 'connected' : 'waiting'
  }

  /** Must run inside a click handler: opens Chrome's device picker. */
  requestFromGesture(): void {
    if (!webHidSupported()) {
      this.status = 'unsupported'
      return
    }
    this.error = ''
    const ds = this.ensure()
    this.status = this.connected ? 'connected' : 'waiting'
    const provider = ds.hid.provider
    if (provider instanceof WebHIDProvider) void provider.getRequest()()
  }

  dispose(): void {
    this.ds?.dispose()
    this.ds = null
  }

  /** Zero the gyro aim at the controller's current orientation. */
  recenter(): void {
    if (!this.ds) return
    const o = this.ds.orientation
    this.ref = { yaw: o.yaw, pitch: o.pitch, roll: o.roll }
  }

  poll(): { frame: InputFrame; active: boolean } | null {
    const ds = this.ds
    if (!ds || !this.connected) return null
    const actions: Action[] = []
    const edge = (key: string, pressed: boolean, action: Action) => {
      if (pressed && !this.prev[key]) actions.push(action)
      this.prev[key] = pressed
    }
    edge('cross', ds.cross.state, 'still')
    edge('square', ds.square.state, 'record')
    edge('triangle', ds.triangle.state, 'playPause')
    edge('circle', ds.circle.state, 'followMode')
    edge('options', ds.options.state, 'smoothing')
    edge('create', ds.create.state, 'release')
    edge('ps', ds.ps.state, 'playTake') // no other pad button was free: the face, sticks, d-pad, bumpers and triggers are taken
    edge('mute', ds.mute.state, 'backToStart') // the microphone-mute button, WebHID only (the Gamepad API has no twin)
    edge('r3', ds.right.analog.button.state, 'recenter')
    edge('dl', ds.dpad.left.state, 'rigPrev')
    edge('dr', ds.dpad.right.state, 'rigNext')
    if (actions.includes('recenter')) this.recenter()

    const o = ds.orientation
    const gyro: GyroAngles = {
      yaw: wrapAngle(o.yaw - this.ref.yaw) * (this.invertYaw ? -1 : 1),
      pitch: wrapAngle(o.pitch - this.ref.pitch) * (this.invertPitch ? -1 : 1),
      roll: wrapAngle(o.roll - this.ref.roll),
    }

    // Touchpad swipe scrubs the timeline: a full-width swipe = 4 s.
    const t = ds.touchpad.left
    let scrub = 0
    let touch: { x: number; y: number } | null = null
    if (t.contact.state) {
      touch = { x: t.x.state, y: t.y.state }
      if (this.lastTouchX !== null) scrub = ((t.x.state - this.lastTouchX) / 2) * 4
      this.lastTouchX = t.x.state
    } else {
      this.lastTouchX = null
    }

    const left = deadzone(ds.left.analog.x.state, ds.left.analog.y.state)
    const right = deadzone(ds.right.analog.x.state, ds.right.analog.y.state)
    const frame: InputFrame = {
      move: left,
      look: right,
      lift: (ds.dpad.up.state ? 1 : 0) - (ds.dpad.down.state ? 1 : 0),
      zoomOut: ds.left.trigger.pressure < 0.04 ? 0 : ds.left.trigger.pressure,
      zoomIn: ds.right.trigger.pressure < 0.04 ? 0 : ds.right.trigger.pressure,
      fine: ds.left.analog.button.state,
      gyro,
      gyroRate: { x: ds.gyroscope.x.state, y: ds.gyroscope.y.state, z: ds.gyroscope.z.state },
      scrub,
      touch,
      actions,
    }
    // The controller is always "active" while held: the gyro is a live input.
    return { frame, active: true }
  }
}
