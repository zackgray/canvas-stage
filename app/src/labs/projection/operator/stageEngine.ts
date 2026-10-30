// The operator engine as the projection stage hosts it, bound to the stage's world: its timeline IS the world clock
// (play / pause / scrub / rewind move the car), recording a take starts the clock from 0 (the whole action, every
// take; a take never loops, and a looping clock picks up again after it), and a finished take carries the world track:
// the car's pose per raw sample, on the take's clock. The Orbit rig circles the stage's pivot choice (`pivot`: Manual
// or Performance; Performance by default once a performance is loaded), which holds for the whole of a take. C / R3
// flashes what it did to the pivot.
import type { Vector3 } from 'three'
import { OperatorEngine } from '../../controller/engine/engine'
import type { EngineOptions } from '../../controller/engine/options'
import { togglePlay } from '../../controller/engine/timeline'
import type { Action } from '../../controller/input/types'
import { recordTrack, takeCams } from '../world/track'
import type { World } from '../world/World'
import { OrbitPivot, RECENTRE_TEXT } from './orbitPivot'
import { aimed, leavesFrameAt, type PresetId, type PresetStart } from './presetMoves'
import { beginMove, endMove, presetStartOf, stepMove, type ScriptedMove } from './scriptedMove'
import { playShot, shotPlaying, stopShot, type ShotPlan } from './shotPlay'

export class StageOperatorEngine extends OperatorEngine {
  private world: World | null = null
  private aspect: () => number = () => 16 / 9
  /** what the Orbit rig circles (Manual / Performance); bind its host to a stage */
  readonly pivot: OrbitPivot
  /** a preset move playing now (Play, or Record filming it), or null */
  move: ScriptedMove | null = null
  /** what Play plays on the camera with the action (the Stage sets it: the picked move or the take); null = the world clock alone */
  shotPlan: () => ShotPlan | null = () => null
  /** what a preset orbits and frames: the orbit pivot (the hero), else the host's target */
  private readonly aimAt: () => Vector3 | null

  /** `orbitTarget` / `orbitRecentre` in the options are the fallback while the pivot has no host */
  constructor(options: EngineOptions) {
    const pivot = new OrbitPivot()
    const aimAt = () => pivot.target() ?? options.orbitTarget?.() ?? null
    super({
      ...options,
      orbitTarget: aimAt,
      orbitRecentre: () => pivot.recentre() ?? (options.orbitRecentre ?? options.orbitTarget)?.() ?? null,
    })
    this.pivot = pivot
    this.aimAt = aimAt
    pivot.canChange = () => !this.deck.recording
    pivot.onChange = (keepAim) => { this.retargetOrbit(undefined, keepAim) }
    pivot.accepts = () => this.rigId === 'orbit' && !this.deck.playback
  }

  /** the pivot's automatic Performance default is checked every frame (a performance loads at any time) */
  tick(dtRaw: number, aspect: number) {
    this.pivot.sync()
    if (this.move) {
      const m = this.move
      if (stepMove(this, m, dtRaw)) { this.move = null; endMove(this, m) }
      return
    }
    // the take cap defaults to the longer of the performance and a piece's travel (5 s without either); held while a take records
    if (!this.deck.recording) {
      const cap = Math.max(this.world?.performance?.duration ?? 0, this.world?.hookDuration ?? 0)
      this.deck.recorder.setDefaultCap(cap > 0 ? cap : null)
    }
    super.tick(dtRaw, aspect)
  }

  /**
   * Play a preset move from the camera as it is framed now, over `seconds` on the world clock from 0; `record` films it as a take
   * (the same recorder and processing as a hand-flown one). Refused while a take records or another move plays.
   */
  startPreset(id: PresetId, seconds: number, record: boolean, hold = false): boolean {
    if (this.move || this.deck.recording) return false
    this.pivot.endPick()
    this.move = beginMove(this, id, seconds, record, this.presetStart(), hold)
    return true
  }

  /** the move's start from the camera now: the aim point, and the performer's chest at any take time (null without a performance) */
  private presetStart(): PresetStart {
    const layer = this.world?.performance
    const subject = layer?.chestAt ? (t: number) => { const c = layer.chestAt!(t); return c ? ([c.x, c.y, c.z] as [number, number, number]) : null } : null
    return presetStartOf(this, this.aimAt()?.clone() ?? null, subject)
  }

  /**
   * Hold on the subject: the camera turns, where it stands, to centre the performer's chest at the take's start, and stays there
   * (a move then starts from this framing and returns to it). False when there is nobody to hold on, or a take or move is running.
   */
  aimAtSubject(): boolean {
    const start = this.presetStart(), chest = start.subject?.(0)
    if (!chest || this.move || this.deck.recording) return false
    const pose = aimed({ position: start.position, quaternion: start.quaternion, focal: start.focal, focus: start.focus }, chest)
    this.takeOver(this.out.position.clone(), this.out.quaternion.clone().fromArray(pose.quaternion), this.out.focal)
    this.focus = pose.focus ?? this.focus
    return true
  }

  /** whether a performer is there to hold on (a performance with positions is loaded) */
  get hasSubject(): boolean { return !!this.world?.performance?.chestAt }

  /** when (s into the take) the performer leaves the frame on this move from the camera now, or null (stays in / no performer) */
  subjectLeavesAt(id: PresetId, seconds: number, hold: boolean): number | null {
    return leavesFrameAt(id, this.presetStart(), seconds, hold, this.aspect())
  }

  /** Stop the move now: a recording keeps what was filmed so far, and the camera goes back to where the move began. */
  stopPreset() {
    const m = this.move
    if (!m) return
    this.move = null
    endMove(this, m)
  }

  /**
   * Play / Pause for the shot (the transport's Play, Space, the pad's play button): a camera move or a take replaying stops (the
   * camera back at the shot's start); a running clock pauses; else the shot plan plays with the action, from the take's start.
   * With no plan (or one that cannot run) it is the world clock's own play. While a take records it is the clock's (a pause ends it).
   */
  playPause() {
    if (shotPlaying(this)) return stopShot(this)
    const plan = this.deck.recording || this.timeline.playing ? null : this.shotPlan()
    if (!plan || !playShot(this, plan)) togglePlay(this.timeline)
  }

  /** C / R3 on the Orbit rig: the flash says what happened to the pivot and how far it is (the gyro recentres too). */
  doAction(a: Action) {
    if (a === 'playPause') return this.playPause()
    if (a !== 'recenter') return super.doAction(a)
    this.pivot.lastRecentre = null
    super.doAction(a)
    const r = this.pivot.lastRecentre as OrbitPivot['lastRecentre'] // set by the recentre inside super
    if (r) this.message = `${RECENTRE_TEXT[r.kind]} · ${this.out.position.distanceTo(r.at).toFixed(1)} m`
  }

  /** Drive (and be driven by) this world's clock; `aspect` is the operator view's (for the car's visible fraction). */
  bind(world: World, aspect: () => number) {
    if (this.world === world) return
    this.world = world
    this.aspect = aspect
    this.timeline = world.clock
  }

  /** Record = rewind the world to 0 and play it while recording (the controller lab plays from the current time). */
  toggleRecording() {
    if (this.move) return this.stopPreset() // R / Stop during a preset ends it (a recording keeps what it filmed)
    if (!this.deck.recording) {
      this.timeline.time = 0
      this.pivot.endPick() // the pivot holds for the take
    }
    super.toggleRecording()
  }

  /**
   * A take runs the clock once (it never loops). When it ends with the clock still running (it reached the end, or R
   * stopped it) a looping clock keeps playing, from 0 at the end; paused with Space mid-take, it stays paused.
   */
  stopRecording() {
    const before = this.deck.takeCount
    const tl = this.timeline
    const resume = this.deck.recording && !!tl.loop && (tl.playing || tl.time >= tl.duration)
    super.stopRecording()
    if (resume) {
      if (tl.time >= tl.duration) tl.time = 0
      tl.playing = true
    }
    const take = this.deck.take
    if (!take || this.deck.takeCount === before || !this.world) return
    take.viewAspect = this.aspect()
    take.trackHash = this.world.trackHash
    const sources = this.world.sources()
    if (sources.length) take.worldTrack = recordTrack(sources, takeCams(take.raw.samples, this.aspect()), take.raw.timelineStart)
  }
}
