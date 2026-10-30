// The timeline the operator engine plays, scrubs and records against (pure). The projection stage hands the engine
// its world clock as this object, so the engine and the stage's own frame loop advance it by the same rule here.
//
// Loop: a playing timeline that reaches its end wraps to the start (keeping the overshoot, so the wrap frame is as
// long as any other) and keeps playing. `once` (a take recording or playing back) never wraps: it stops at the end.

export interface Timeline {
  time: number
  playing: boolean
  /** seconds */
  duration: number
  /** wrap at the end instead of stopping (absent: stop) */
  loop?: boolean
}

/** Advance a playing timeline by dt (no-op when paused). */
export function advanceTimeline(tl: Timeline, dt: number, once = false) {
  if (!tl.playing) return
  tl.time += dt
  if (tl.time < tl.duration) return
  if (tl.loop && !once && tl.duration > 0) tl.time %= tl.duration
  else {
    tl.time = tl.duration
    tl.playing = false
  }
}

/** Play / pause; play from the end starts over. */
export function togglePlay(tl: Timeline) {
  if (!tl.playing && tl.time >= tl.duration) tl.time = 0
  tl.playing = !tl.playing
}
