// Recording and playback of takes. Owns the recorder, the last processed take, and the
// raw / smoothed / keyframes playback used to compare them. The engine ends a finished playback or,
// with Loop on, rewinds it (owner 2026-10-28: the last take actually loops); the scrub bar seeks it.
import type { ProcessedTake } from '../take/processTake'
import { processTake, reduceProcessed } from '../take/processTake'
import { TakeRecorder } from '../take/recorder'
import type { CameraSample } from '../take/types'
import { evaluateTrack } from '../take/types'

export type PlaybackTrack = 'raw' | 'smoothed' | 'keyframes'

export interface Playback {
  track: PlaybackTrack
  t: number
  /** a take from disk (a locked take's own samples): played as is, and the in-memory take is never touched */
  samples?: CameraSample[]
}

export class TakeDeck {
  readonly recorder = new TakeRecorder()
  take: ProcessedTake | null = null
  playback: Playback | null = null
  tolerance = 1
  takeCount = 0

  get recording(): boolean {
    return this.recorder.recording
  }

  start(initial: Omit<CameraSample, 't'>, meta: { timelineStart: number; rig: string; smoothingAmount: number }) {
    this.playback = null
    this.recorder.start(initial, meta)
  }

  /** Returns true if the cap was hit this frame. */
  tick(dt: number, pose: Omit<CameraSample, 't'>): boolean {
    return this.recorder.tick(dt, pose)
  }

  stop(): ProcessedTake | null {
    const raw = this.recorder.stop()
    if (!raw) return null
    this.take = processTake(raw, this.tolerance)
    this.takeCount++
    return this.take
  }

  setTolerance(k: number) {
    this.tolerance = k
    if (this.take) {
      const { raw, smoothed } = this.take
      this.take = { ...this.take, ...reduceProcessed(raw, smoothed, k) }
    }
  }

  trackSamples(track: PlaybackTrack): CameraSample[] | null {
    if (!this.take) return null
    if (track === 'raw') return this.take.raw.samples
    if (track === 'smoothed') return this.take.smoothed
    return this.take.keyframes
  }

  play(track: PlaybackTrack): number | null {
    if (!this.take || this.recording) return null
    this.playback = { track, t: 0 }
    return this.take.raw.timelineStart
  }

  /** Play a locked take's own camera samples (Shoot's ▶ on a take row); `take` (an unlocked recording) stays as it was. */
  playSamples(samples: CameraSample[]): boolean {
    if (this.recording || samples.length < 2) return false
    this.playback = { track: 'raw', t: 0, samples }
    return true
  }

  /** Advance playback; returns the camera sample, or null at/after the end. The playback stays set: the engine ends it
   * (Stop) or rewinds it (Loop) on the frame after the end. */
  tickPlayback(dt: number): CameraSample | null {
    const pb = this.playback
    const samples = pb && (pb.samples ?? this.trackSamples(pb.track))
    if (!pb || !samples) return null
    pb.t += dt
    const end = samples[samples.length - 1].t
    if (pb.t > end) return null
    return evaluateTrack(samples, pb.t)
  }

  /** Loop: back to the start of the take now playing (false when nothing plays or a take records). */
  rewind(): boolean {
    const pb = this.playback
    if (!pb || this.recording) return false
    pb.t = 0
    return true
  }

  /** the playing take's length (s: its last sample's t), or null when nothing plays. */
  playbackEnd(): number | null {
    const pb = this.playback
    const samples = pb && (pb.samples ?? this.trackSamples(pb.track))
    return samples && samples.length ? samples[samples.length - 1].t : null
  }
}
