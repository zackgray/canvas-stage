// The world clock: one timeline for everything that moves in the set. It is the operator engine's `timeline` object
// itself (same fields), so Operator mode plays, scrubs, rewinds and records against it exactly as the controller lab's
// timeline does; outside Operator mode the stage's frame loop advances it. Both advance it by one rule (timeline.ts).
import { advanceTimeline, togglePlay } from '../../controller/engine/timeline'
import { TIMELINE_DURATION } from '../../controller/scene/carPath'

export class WorldClock {
  time = 0
  playing = false
  /** seconds; set from the car's path (World), else the controller lab's default */
  duration = TIMELINE_DURATION

  /** at the end, wrap to 0 and keep playing (on by default: the fight keeps moving while the camera plays around).
   * A take never loops: recording plays the clock once from 0 and stops at the end (the engine's `once`). */
  loop = true

  /** Advance a frame while playing; at the end it wraps (loop) or stops. */
  tick(dt: number) {
    advanceTimeline(this, dt)
  }

  toggleLoop() {
    this.loop = !this.loop
  }

  /** Play / pause; play from the end starts over (the engine's playPause). */
  toggle() {
    togglePlay(this)
  }

  rewind() {
    this.time = 0
  }

  scrub(t: number) {
    this.time = Math.min(this.duration, Math.max(0, t))
  }

  /** Scrub by hand: pause and go to t. */
  seek(t: number) {
    this.playing = false
    this.scrub(t)
  }

  setDuration(d: number) {
    this.duration = d
    if (this.time > d) this.time = d
  }
}
