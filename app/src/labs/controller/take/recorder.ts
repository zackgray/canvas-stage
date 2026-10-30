// Records the camera at a fixed rate (24 fps) regardless of the render frame rate: each fixed
// sample time is interpolated between the two render frames that straddle it. Hard-capped.
import type { CameraSample, RawTake, TakeEvent } from './types'
import { lerpSample } from './types'

export const TAKE_FPS = 24
export const DEFAULT_CAP_SECONDS = 5

export class TakeRecorder {
  fps = TAKE_FPS
  /** the cap a user typed in; null = the default below */
  private manualCap: number | null = null
  private defaultCap = DEFAULT_CAP_SECONDS
  /** The take's hard cap: what the user set, else the loaded performance's length, else 5 s. */
  get capSeconds() { return this.manualCap ?? this.defaultCap }
  set capSeconds(s: number) { this.manualCap = s }
  /** The default cap follows the performance on the clock (null / non-positive: 5 s). A typed cap is kept. */
  setDefaultCap(seconds: number | null) {
    this.defaultCap = seconds !== null && Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_CAP_SECONDS
  }
  recording = false
  elapsed = 0
  private samples: CameraSample[] = []
  private events: TakeEvent[] = []
  private prev: CameraSample | null = null
  private next = 0
  private meta = { timelineStart: 0, rig: '', smoothingAmount: 0 }

  start(initial: Omit<CameraSample, 't'>, meta: { timelineStart: number; rig: string; smoothingAmount: number }) {
    this.recording = true
    this.elapsed = 0
    this.meta = meta
    this.events = []
    this.prev = { ...initial, t: 0 }
    this.samples = [this.prev]
    this.next = 1
  }

  /** Advance by a render frame. Returns true when the cap has been reached (caller should stop). */
  tick(dt: number, pose: Omit<CameraSample, 't'>): boolean {
    if (!this.recording || !this.prev) return false
    const t0 = this.elapsed
    // The pose belongs to the end of the full frame, even when that frame runs past the cap.
    const tEnd = t0 + dt
    const t1 = Math.min(tEnd, this.capSeconds)
    const current: CameraSample = { ...pose, t: tEnd }
    const span = tEnd - t0
    while (this.next / this.fps <= t1 + 1e-9) {
      const ts = this.next / this.fps
      const a = span > 0 ? (ts - t0) / span : 1
      this.samples.push(lerpSample(this.prev, current, a, ts))
      this.next++
    }
    this.prev = current
    this.elapsed = t1
    return t1 >= this.capSeconds - 1e-9
  }

  mark(type: TakeEvent['type']) {
    if (this.recording) this.events.push({ t: this.elapsed, type })
  }

  stop(): RawTake | null {
    if (!this.recording) return null
    this.recording = false
    if (this.samples.length < 2) return null
    return {
      fps: this.fps,
      timelineStart: this.meta.timelineStart,
      rig: this.meta.rig,
      capSeconds: this.capSeconds,
      smoothingAmount: this.meta.smoothingAmount,
      samples: this.samples,
      events: this.events,
    }
  }
}
