// What moves in the set: the world clock, the fitted ground, the car on its path, its lights and the path handles.
// The car is a normal scene object (in the view, in every colour and depth capture); the handles are live-only.
// `at(t, fn)` sets the clock to t and poses everything there for one capture, then puts both back.
// A performance (the lifted actors of an approved clip) is a clock layer: posed for every time the world shows.
import { DirectionalLight, Group, HemisphereLight, Vector3, type Object3D, type PerspectiveCamera } from 'three'
import { Car } from './car'
import { CAR_LAB_ASSET, loadCar } from './carAsset'
import { WorldClock } from './clock'
import { onPlane, rayPlane, type Plane, type PlaneFit, type Q4, type V3 } from './geom'
import { fitGround, refitAlong, sunDirection, type DepthView } from './ground'
import { PathHandles } from './handles'
import { NO_WORLD } from '../../../../server/clip/pose.ts'
import { motion, pathHash, poseAt, type CarPath, type CarPose, type Motion } from './path'
import type { TrackSource } from './track'

export const CAR_ID = 'car'
// the prompt's noun phrase, article included (video/action.ts WorldObject.label)
const CAR_LABEL = 'a red compact coupe'
const PLACEHOLDER_LABEL = 'a car'

export type CarLoader = typeof loadCar

export interface Ground { global: PlaneFit; local: PlaneFit | null }

/** Something on the world clock besides the car (a performance layer): in every view and capture, posed at the clock's time. */
export interface ClockLayer {
  readonly object: Object3D
  /** seconds it holds the clock for */
  readonly duration: number
  pose(t: number): void
  /** a fixed point to orbit (world space) for the whole clip, or null */
  pivot?(): Vector3 | null
  /** the performer's chest (world space) at clock time t, from the performance's own positions; null when it is not there */
  chestAt?(t: number): Vector3 | null
}

/** Something else posed on the clock (prop-movement wave: a kit layer's travelling pieces); nothing to add to the scene. */
export interface ClockHook {
  /** seconds it holds the clock for (a getter, so a re-read plan's longer travel is seen at the next sync) */
  readonly duration: number
  pose(t: number): void
}

export class World {
  readonly group = new Group()
  readonly clock = new WorldClock()
  ground: Ground | null = null
  car: Car | null = null
  path: CarPath | null = null
  /** the performance on the clock (its owner disposes it) */
  performance: ClockLayer | null = null
  private readonly hooks = new Set<ClockHook>()
  private motion: Motion | null = null
  private view: DepthView | null = null
  private handles = new PathHandles()
  private editing = false
  private readonly key = new DirectionalLight(0xffd2a1, 2.4)
  private readonly fill = new HemisphereLight(0xc4d6f2, 0x5a4a3a, 0.9)
  private readonly loader: CarLoader
  private asset: ReturnType<CarLoader> | null = null
  /** bumped on every change the UI shows */
  version = 0

  constructor(loader: CarLoader = loadCar) {
    this.loader = loader
    this.group.name = 'world'
    this.group.add(this.key, this.key.target, this.fill, this.handles.group)
  }

  /** The plane the car stands on: the local refit along the path, else the global fit. */
  get plane(): Plane | null { return this.ground ? this.ground.local ?? this.ground.global : null }

  /**
   * Fit the street to the set as the projector sees it (`view`); `sunFrom` is the projector's orientation, which the
   * sun estimate is relative to. Returns the fit, or null (no ground in the bottom of the frame).
   */
  fitGround(view: DepthView, sunFrom: Q4): PlaneFit | null {
    const g = fitGround(view)
    this.view = view
    this.ground = g ? { global: g, local: null } : null
    if (g) this.key.position.set(...sunDirection(sunFrom, g.n)).multiplyScalar(40)
    if (this.path) this.setPath(this.path)
    this.version++
    return g
  }

  /** The ground point under normalised device coords of `cam`, or null (above the horizon, or no ground fitted). */
  groundAt(cam: PerspectiveCamera, ndc: { x: number; y: number }): V3 | null {
    const pl = this.plane
    if (!pl) return null
    cam.updateMatrixWorld(true)
    const o = cam.getWorldPosition(new Vector3())
    const dir = new Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(o).normalize()
    return rayPlane(pl, o.toArray() as V3, dir.toArray() as V3)
  }

  /** Put the car on the ground on `path` (loading its mesh the first time). */
  addCar(path: CarPath) {
    if (!this.plane) throw new Error('fit the ground first')
    if (!this.car) {
      this.car = new Car()
      this.group.add(this.car.root)
      void this.loadBody(this.car)
    }
    this.setPath(path)
  }

  private async loadBody(car: Car) {
    this.asset ??= this.loader()
    const got = await this.asset
    if (this.car !== car) return
    if ('missing' in got) car.bodyNote = `placeholder box: ${got.missing}`
    else car.setBody(got.mesh.clone(), got.size, got.base === CAR_LAB_ASSET ? 'E24 car A (raw lab mesh)' : 'E24 car A (stage mesh)')
    this.apply(this.clock.time)
    this.version++
  }

  removeCar() {
    this.car?.dispose()
    this.car = null
    this.path = null
    this.motion = null
    if (this.ground) this.ground.local = null
    this.handles.group.visible = false
    this.syncDuration()
    this.version++
  }

  /** Put a performance on the clock (null takes it off); the clock runs as long as the longer of it and the car. */
  setPerformance(p: ClockLayer | null) {
    if (this.performance) this.group.remove(this.performance.object)
    this.performance = p
    if (p) this.group.add(p.object)
    this.syncDuration()
    this.apply(this.clock.time)
    this.version++
  }

  /**
   * Pose `h` on the clock besides the performance (prop-movement wave: the kit layer's travelling pieces); returns the unregister.
   * The clock runs as long as the longest of the car, the performance and every hook.
   */
  addClockHook(h: ClockHook): () => void {
    this.hooks.add(h)
    this.syncDuration()
    this.apply(this.clock.time)
    this.version++
    return () => {
      if (!this.hooks.delete(h)) return
      this.syncDuration()
      this.apply(this.clock.time)
      this.version++
    }
  }

  /** seconds the longest clock hook holds; 0 with none (a take's recorder cap covers a piece's travel) */
  get hookDuration(): number { return [...this.hooks].reduce((d, h) => Math.max(d, h.duration), 0) }

  /** Re-read every hook's duration (a re-read plan may carry a longer travel); the clock follows. */
  syncClock() { this.syncDuration() }

  private syncDuration() {
    const d = Math.max(this.motion?.duration ?? 0, this.performance?.duration ?? 0, this.hookDuration)
    this.clock.setDuration(d > 0 ? d : new WorldClock().duration)
  }

  /** New path (or speed / arrival): refit the street along it, ends onto that plane, clock length from the motion. */
  setPath(p: CarPath) {
    const g = this.ground
    if (!g) return
    g.local = this.view ? refitAlong(this.view, g.global, p.start, p.end) : null
    const pl = this.plane!
    this.path = { ...p, start: onPlane(pl, p.start), end: onPlane(pl, p.end) }
    this.motion = motion(this.path)
    this.syncDuration()
    this.handles.set(this.path.start, this.path.end, pl.n)
    this.handles.group.visible = this.editing && !!this.car
    this.apply(this.clock.time)
    this.version++
  }

  get carLabel() { return this.car && !this.car.bodyNote.startsWith('placeholder') ? CAR_LABEL : PLACEHOLDER_LABEL }
  get arrive() { return this.motion?.arrive ?? null }
  /** what drives the world's motion (the car's path), NO_WORLD with nothing moving: a still and a take each record it */
  get trackHash() { return this.car && this.path ? pathHash(this.path) : NO_WORLD }

  /** The car's pose at world time t from its path, or null (no car). */
  carPose(t: number): CarPose | null {
    return this.path && this.motion ? poseAt(this.path, t, this.motion) : null
  }

  /** Pose every object for world time t; `poses` (a recorded track's) win over the paths. */
  private apply(t: number, poses?: Map<string, CarPose>) {
    const pose = poses?.get(CAR_ID) ?? this.carPose(t)
    if (this.car && pose) this.car.place(pose, this.plane!.n)
    if (this.car) this.key.target.position.copy(this.car.root.position)
    this.key.target.updateMatrixWorld()
    this.performance?.pose(t)
    for (const h of this.hooks) h.pose(t)
  }

  /** One live frame: advance the clock by `dt` (0 while the operator engine advances it) and pose for its time. */
  frame(dt: number) {
    this.clock.tick(dt)
    this.apply(this.clock.time)
  }

  /** Run `fn` with the clock at world time t and everything posed there (from `poses` when given), then restore. */
  at<T>(t: number, fn: () => T, poses?: Map<string, CarPose>): T {
    const saved = this.clock.time
    this.clock.time = t
    this.apply(t, poses)
    try {
      return fn()
    } finally {
      this.clock.time = saved
      this.apply(saved)
    }
  }

  /** Run a capture with the live-only handles hidden. */
  capture<T>(fn: () => T): T {
    const shown = this.handles.group.visible
    this.handles.group.visible = false
    try {
      return fn()
    } finally {
      this.handles.group.visible = shown
    }
  }

  /** Run `fn` with the world's objects out of the scene's renders (captures that become part of the set). */
  without<T>(fn: () => T): T {
    const shown = this.group.visible
    this.group.visible = false
    try {
      return fn()
    } finally {
      this.group.visible = shown
    }
  }

  get handlesVisible() { return this.handles.group.visible }

  /** Build shows the path handles; other pages do not. */
  setEditing(on: boolean) {
    this.editing = on
    this.handles.group.visible = on && !!this.car
  }

  /** What a take records: the car from its path. */
  sources(): TrackSource[] {
    const car = this.car
    if (!car || !this.path) return []
    return [{ id: CAR_ID, kind: 'car', label: this.carLabel, up: this.plane!.n, size: car.size, poseAt: (t) => this.carPose(t)! }]
  }

  dispose() {
    this.car?.dispose()
    this.handles.dispose()
    this.key.dispose()
    this.fill.dispose()
    this.group.removeFromParent()
  }
}
