// The operator engine: one tick per render frame turns device input into a camera pose.
// input -> rig -> lens -> stabiliser -> (recorder) -> camera. React-free; the scene just applies it.
import { Quaternion, Vector3 } from 'three'
import { InputHub } from '../input/inputHub'
import type { Action, CameraAction, InputState, RigId } from '../input/types'
import { RIG_IDS, expo } from '../input/types'
import { DEFAULT_FOCAL_MM, clampFocal, hfovFromFocal, vfovFromHfov, zoomFocal } from '../math/lens'
import { clamp } from '../math/spring'
import { createRigs } from '../rigs'
import { OrbitRig } from '../rigs/orbitRig'
import { Stabiliser } from '../rigs/stabiliser'
import type { FollowMode, Rig, RigContext, RigPose } from '../rigs/types'
import { lookAngles, clonePose, poseFromQuaternion, poseQuaternion } from '../rigs/types'
import type { CarState } from '../scene/carPath'
import { CAR_AIM_HEIGHT, TIMELINE_DURATION, carStateAt } from '../scene/carPath'
import type { CameraSample } from '../take/types'
import type { EngineOptions, StillEvent } from './options'
import type { PlaybackTrack } from './takeDeck'
import { TakeDeck } from './takeDeck'
import { runAction } from './actions'
import { advanceTimeline, type Timeline } from './timeline'

const LOOK_RATE = 1.3 // rad/s at full stick on a 35 mm lens
const MOUSE_RATE = 0.0022 // rad per pixel on a 35 mm lens
const HFOV_35 = hfovFromFocal(35)

export type { EngineOptions, StillEvent } from './options'

export class OperatorEngine {
  readonly hub = new InputHub()
  readonly rigs: Record<RigId, Rig> = createRigs()
  readonly stabiliser = new Stabiliser()
  readonly deck = new TakeDeck()
  rigId: RigId = 'follow'
  followMode: FollowMode = 'pan'
  focal = DEFAULT_FOCAL_MM
  /** how far ahead the camera aims, metres: where a preset move looks when nothing is picked. Not a lens control and never recorded (there is no rack focus); 'hold on the subject' and a saved pose set it. */
  focus = 10
  gyroGain = 1
  timeline: Timeline = { time: 0, playing: false, duration: TIMELINE_DURATION }
  stills: StillEvent[] = []
  message = ''
  private messageUntil = 0
  private clock = 0
  readonly car: CarState = carStateAt(0)
  readonly carAim = new Vector3()
  /** Output for the render camera this frame. */
  readonly out = { position: new Vector3(), quaternion: new Quaternion(), focal: DEFAULT_FOCAL_MM }
  private rigPose: RigPose = { position: new Vector3(-8, 1.7, 12), yaw: 0, pitch: 0, roll: 0 }
  private needsEnter = true
  private wasPlaying = false
  readonly rigIds: RigId[]
  readonly hasCar: boolean
  readonly options: EngineOptions
  /** the host's hold, let go on Create / Esc (the Stage registers its Hold tick and its move); returns whether anything was held */
  onRelease: () => boolean = () => false
  /** the host's camera-panel actions (the Stage's Set start here / Back to start / Play take / Stop take / clear the aim); null = unhosted */
  onCameraAction: ((a: CameraAction) => void) | null = null
  /** the host's act just before a recording starts (the Stage puts the camera back on its saved start when asked to) */
  beforeRecord: (() => void) | null = null
  /** fly-with-aim-lock: while set, the position stays the operator's but the aim turns to the target each frame */
  aimLock: (() => Vector3 | null) | null = null
  private playbackStart = 0

  constructor(options: EngineOptions = {}) {
    this.options = options
    this.rigIds = options.rigs ?? RIG_IDS
    this.hasCar = options.car ?? true
    if (options.rig) this.rigId = options.rig
    this.updateCar()
    Object.assign(this.rigPose, lookAngles(this.rigPose.position, this.carAim))
    this.stabiliser.reset(this.rigPose.position, poseQuaternion(this.rigPose))
  }

  attach(el: HTMLElement): () => void {
    const detach = this.hub.keyboard.attach(el)
    void this.hub.dualsense.autoConnect()
    return () => {
      detach()
      this.hub.dualsense.dispose()
    }
  }

  private updateCar() {
    carStateAt(this.timeline.time, this.car)
    this.carAim.copy(this.car.position).setY(this.car.position.y + CAR_AIM_HEIGHT)
  }

  /** show `msg` over the picture for a moment */
  flash(msg: string) {
    this.message = msg
    this.messageUntil = this.clock + 2.5
  }

  setRig(id: RigId) {
    if (!this.rigIds.includes(id)) return
    if (id === this.rigId && !this.needsEnter) return
    this.rigId = id
    this.needsEnter = true
  }

  /** Main loop. aspect = render width / height. */
  tick(dtRaw: number, aspect: number) {
    const dt = Math.min(dtRaw, 0.1)
    this.clock += dt
    if (this.clock > this.messageUntil) this.message = ''
    const input = this.hub.poll(dt)
    this.handleActions(input)

    // Lens: triggers zoom multiplicatively; the wheel steps.
    const fine = input.fine ? 0.3 : 1
    this.focal = zoomFocal(this.focal, (input.zoomIn - input.zoomOut) * 0.7 * fine, dt)
    if (input.wheel) this.focal = clampFocal(this.focal * Math.exp(-input.wheel * 0.0008))

    // Timeline (car).
    if (input.scrub && !this.deck.recording) {
      this.timeline.time = clamp(this.timeline.time + input.scrub, 0, this.timeline.duration)
    }
    // a take recording or playing back runs the timeline once (never loops)
    advanceTimeline(this.timeline, dt, this.deck.recording || !!this.deck.playback)
    this.updateCar()

    // Playback overrides the operator.
    const pb = this.deck.tickPlayback(dt)
    if (pb) {
      this.applySample(pb)
      return
    }
    if (this.wasPlaying) {
      // Loop replays the take (the world clock with it, from the take's start); else the replay is over and the
      // camera goes back where the take began
      if (this.timeline.loop && this.deck.rewind()) {
        this.timeline.time = this.playbackStart
        this.timeline.playing = true
      } else this.endPlayback()
    }

    const hfov = hfovFromFocal(this.focal)
    const ctx = this.context(input, dt, fine, hfov, vfovFromHfov(hfov, aspect))
    const rig = this.rigs[this.rigId]
    if (this.needsEnter) {
      // while the aim is locked the rig re-anchors from its own pose: its place is its own, only the aim is the lock's
      rig.enter(this.aimLock ? clonePose(this.rigPose) : poseFromQuaternion(this.stabiliser.position, this.stabiliser.quaternion), ctx)
      this.needsEnter = false
    }
    this.rigPose = rig.update(ctx)
    const lockAt = this.aimLock?.() ?? null
    if (lockAt) {
      // the aim turns to the target, the position free: the aimed angles become the rig's (re-anchored above next frame), so
      // letting the lock go is no snap back; the out orientation below is the aimed one exactly, no smoothing lag
      const aim = lookAngles(this.stabiliser.position, lockAt)
      this.rigPose = { position: this.rigPose.position, yaw: aim.yaw, pitch: aim.pitch, roll: 0 }
      this.needsEnter = true
    }
    this.stabiliser.apply(this.rigPose.position, poseQuaternion(this.rigPose), dt)
    this.out.position.copy(this.stabiliser.position)
    this.out.quaternion.copy(lockAt ? poseQuaternion(this.rigPose) : this.stabiliser.quaternion)
    this.out.focal = this.focal

    if (this.deck.recording) {
      const capped = this.deck.tick(dt, this.currentSample())
      if (capped || !this.timeline.playing) this.stopRecording()
    }
  }

  private context(input: InputState, dt: number, fine: number, hfov: number, vfov: number): RigContext {
    const lensScale = (hfov / HFOV_35) * fine
    const g = input.gyro
    return {
      dt,
      input,
      aimDelta: {
        yaw: -(expo(input.look.x) * LOOK_RATE * dt + input.mouse.x * MOUSE_RATE) * lensScale,
        pitch: (expo(input.look.y) * LOOK_RATE * dt - input.mouse.y * MOUSE_RATE) * lensScale,
      },
      gyro: g
        ? { yaw: g.yaw * this.gyroGain, pitch: g.pitch * this.gyroGain, roll: g.roll * this.gyroGain }
        : { yaw: 0, pitch: 0, roll: 0 },
      speedScale: fine,
      car: this.car,
      carAim: this.carAim,
      hfov,
      vfov,
      followMode: this.followMode,
      orbitTarget: this.options.orbitTarget,
    }
  }

  private currentSample(): Omit<CameraSample, 't'> {
    const p = this.out.position
    const q = this.out.quaternion
    return { position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w], focal: this.focal }
  }

  private applySample(s: CameraSample) {
    this.out.position.fromArray(s.position)
    this.out.quaternion.fromArray(s.quaternion)
    this.out.focal = s.focal
  }

  handleActions(input: InputState) {
    for (const a of input.actions) this.doAction(a)
  }

  /** what one press does (actions.ts) */
  doAction(a: Action) { runAction(this, a) }

  /**
   * Re-anchor the orbit rig (when it is the rig) on `target` (default: the host's orbit target, else the car), keeping
   * the camera where it is; `keepAim` keeps its aim too (a pivot change), else it turns to the target (C / R3). Never
   * while recording: a take keeps the pivot it started with. Returns whether it re-anchored.
   */
  retargetOrbit(target = this.options.orbitTarget, keepAim = true): boolean {
    const rig = this.rigs[this.rigId]
    if (!(rig instanceof OrbitRig) || this.deck.recording || this.needsEnter) return false
    const g = this.hub.state.gyro ?? { yaw: 0, pitch: 0 }
    const aim = poseFromQuaternion(this.out.position, this.out.quaternion)
    rig.target.copy(target?.() ?? this.carAim)
    rig.retarget(this.out.position, keepAim ? { yaw: aim.yaw - g.yaw * this.gyroGain, pitch: aim.pitch - g.pitch * this.gyroGain } : undefined)
    return true
  }

  toggleRecording() {
    if (this.deck.recording) return this.stopRecording()
    if (this.timeline.time >= this.timeline.duration - 0.5) this.timeline.time = 0
    if (this.deck.playback) this.endPlayback()
    this.beforeRecord?.()
    this.timeline.playing = true
    this.deck.start(this.currentSample(), {
      timelineStart: this.timeline.time,
      rig: this.rigId,
      smoothingAmount: this.stabiliser.enabled ? this.stabiliser.amount : 0,
    })
    this.flash('Recording')
  }

  stopRecording() {
    const take = this.deck.stop()
    this.timeline.playing = false
    if (take) {
      const n = take.lint.warnings.length
      this.flash(`Take ${this.deck.takeCount}: ${take.keyframes.length} keyframes${n ? ` · ${n} warning(s)` : ''}`)
    }
  }

  /** Hand the camera back to the operator, exactly where the rig left it. */
  endPlayback() {
    this.deck.playback = null
    this.wasPlaying = false
    this.timeline.playing = false
    this.stabiliser.reset(this.rigPose.position, poseQuaternion(this.rigPose))
    this.out.position.copy(this.stabiliser.position)
    this.out.quaternion.copy(this.stabiliser.quaternion)
    this.out.focal = this.focal
  }

  /**
   * Take over a camera exactly where it is: rig and stabiliser start at this pose, the lens at this focal
   * (clamped to the zoom range). Stops any take being recorded or played. Returns the focal actually used.
   */
  takeOver(position: Vector3, quaternion: Quaternion, focal: number): number {
    if (this.deck.recording) this.stopRecording()
    this.deck.playback = null
    this.wasPlaying = false
    this.rigPose = poseFromQuaternion(position, quaternion)
    this.stabiliser.reset(position, quaternion)
    this.focal = clampFocal(focal)
    this.out.position.copy(position)
    this.out.quaternion.copy(quaternion)
    this.out.focal = this.focal
    this.needsEnter = true
    return this.focal
  }

  /** a locked take from disk: its camera path from `start` on the clock (the in-memory take is left alone) */
  playRecord(samples: CameraSample[], start: number) { if (this.deck.playSamples(samples)) this.startPlayback(start) }

  playTake(track: PlaybackTrack) {
    const start = this.deck.play(track)
    if (start !== null) this.startPlayback(start)
  }

  private startPlayback(start: number) {
    this.playbackStart = start
    this.timeline.time = start
    this.timeline.playing = true
    this.wasPlaying = true
  }

  /** Jump the running take playback to `t` seconds into the take (the scrub bar); the world clock follows it. */
  seekPlayback(t: number) {
    const end = this.deck.playbackEnd()
    if (end === null || !this.deck.playback) return
    this.deck.playback.t = clamp(t, 0, end)
    this.timeline.time = Math.min(this.playbackStart + this.deck.playback.t, this.timeline.duration)
  }
}
