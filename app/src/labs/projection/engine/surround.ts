// The Surround far layer: the location's 360 panorama + its distance as a mesh (and, outdoors, a sky-only dome) drawn
// BEHIND the projected set, in the live view and in the warp export. Composite rule (E46): render the far scene, clear
// depth, render the set, so the set wins wherever it has geometry and the surround only fills what the set leaves empty.
// The far scene is a separate Scene on purpose: that is what lets one `clearDepth` sit between the two draws.
import { Color, Group, Matrix4, Scene, type Camera, type Material, type Mesh, type Object3D, type Texture } from 'three'
import { upOf } from '../../../../server/surround/equirect.ts'
import type { SurroundMeta } from '../../../../server/surround/types.ts'
import { readSurroundColour, readSurroundFloor } from '../../../shared/worldContract.ts'
import { decodePng } from '../math/png'
import { matchGround, surroundFloorPlane, type FloorPlane, type Footprint } from './groundMatch'
import type { ProjectionSource } from './projectionSource'
import type { ClayTarget } from './clay'
import { setDomeClay, setFarClay } from './clayMaterials'
import { unswapClay } from './claySwap'
import { loadColour, type ColourDecoder, type ColourGpu, type ColourState } from './surroundColour'
import { buildDomeTexture, buildFarGeometry, distanceMetres, rgbaOf } from './surroundMesh'
import { domeMesh, farMesh, panoTexture, poseDome, setFarColour, setFarPositions } from './surroundParts'

/** The slice of WebGLRenderer the layered draw uses (a fake in the tests records the call order). */
export interface DrawTarget {
  autoClear: boolean
  render(scene: Scene, camera: Camera): void
  clear(): void
  clearDepth(): void
}

const HOLE_BACKGROUND = (bg: unknown) => bg instanceof Color && bg.r === 1 && bg.g === 0 && bg.b === 1

export interface SurroundData { meta: SurroundMeta; rgb: Uint8Array; channels: 3 | 4; dist: Float32Array }

/**
 * Owns the far scene. `projector` is the still's camera: the far mesh is in its space, so the group follows the projector's
 * world matrix, times the world root scale (`rootScale`, worldScale.ts). Visible in the live view when `visible`; in
 * captures only inside `captureOn` (the warp export), so the stills, settle and lift passes never see it. With a fitted
 * surround floor and the set's floor known, the far ground is matched to the set's (groundMatch.ts); with a hi-res colour
 * and a GPU that takes it, the far mesh samples that instead of the 2048 colour (surroundColour.ts).
 */
export class SurroundLayer implements ClayTarget {
  readonly scene = new Scene()
  visible = true
  /** the Clay look is on: the far mesh and dome draw as smoothed luma (preview only) */
  private clay = false
  private capturing = 0
  far: Mesh | null = null
  dome: Mesh | null = null
  meta: SurroundMeta | null = null
  locationId: string | null = null
  /** The world the lab says is current (explicit id). While set, `follow` never overrides it. */
  worldId: string | null = null
  /** the world root scale the far scene is drawn at (the set's, worldScale.ts) */
  rootScale = 1
  /** what the far mesh's colour is now (hi-res width, or 0 for the 2048 colour) */
  colour: ColourState = { width: 0, fellBack: null }
  /** the GPU the hi-res colour is checked against and uploaded to; none = never hi-res (tests, no renderer) */
  gpu: ColourGpu | null = null
  decoder: ColourDecoder | undefined
  private readonly group = new Group()
  private readonly projector: Object3D
  private token = 0
  private textures: Texture[] = []
  /** the far mesh as built (before the ground match), the surround's own floor, and the set's */
  private raw: { position: Float32Array; cols: number; rows: number } | null = null
  private surFloor: FloorPlane | null = null
  private setFloor: FloorPlane | null = null
  private foot: Footprint | null = null
  private hires: Texture | null = null
  private onChanged = (e: Event) => { const id = (e as CustomEvent<{ locationId?: string }>).detail?.locationId; if (id && id === this.locationId) void this.load(id) }

  constructor(projector: Object3D) {
    this.projector = projector
    this.group.matrixAutoUpdate = false
    this.scene.add(this.group)
    // SurroundSection fires this after a pick so the open lab picks the new panorama up without a reload
    if (typeof window !== 'undefined') window.addEventListener('surround:changed', this.onChanged)
  }

  get ready(): boolean { return !!this.far }
  get inCapture(): boolean { return this.capturing > 0 }

  /** Run `fn` with the layer part of every capture (the warp export). */
  captureOn<T>(fn: () => T): T {
    this.capturing++
    try { return fn() } finally { this.capturing-- }
  }

  /** The lab's current world id, passed explicitly (null = none known: `follow` falls back to the source's URL). */
  setWorld(id: string | null): void {
    this.worldId = id
    if (id && id !== this.locationId) void this.load(id)
  }

  /** Fallback when no explicit world is set. Follow the stage's source: the location id is in its still's URL (/lab-assets/locations/<id>/still.png). */
  follow(source: ProjectionSource | null) {
    if (this.worldId) return
    const img = source?.texture?.image as { currentSrc?: string; src?: string } | undefined
    const m = /\/lab-assets\/locations\/(loc-[^/]+)\//.exec(img?.currentSrc || img?.src || '')
    if (m) { if (m[1] !== this.locationId) void this.load(m[1]); return }
    if (!source || (source.texture as { isDataTexture?: boolean }).isDataTexture) this.clear()
  }

  async load(locationId: string): Promise<void> {
    const token = ++this.token
    this.locationId = locationId
    try {
      const res = await fetch(`/lab-assets/locations/${locationId}/meta.json`, { cache: 'no-cache' })
      const meta = res.ok ? ((await res.json()) as { surround?: SurroundMeta }).surround : undefined
      if (!meta) { if (token === this.token) this.dropMeshes(); return }
      const [pano, dist] = await Promise.all([meta.url, meta.distUrl].map(async (u) => decodePng(new Uint8Array(await (await fetch(`${u}?v=${encodeURIComponent(meta.pickedAt)}`)).arrayBuffer()))))
      if (token !== this.token) return
      this.setData({ meta, rgb: pano.data as Uint8Array, channels: pano.channels === 4 ? 4 : 3, dist: distanceMetres(dist.data, meta.distMetersPerUnit) })
      await this.loadHiRes(meta, token)
    } catch (e) {
      if (token === this.token) { this.dropMeshes(); console.warn('surround layer not loaded', e) }
    }
  }

  /** The separate hi-res colour, when the world has one and the GPU takes it; the 2048 colour stays otherwise. */
  async loadHiRes(meta: SurroundMeta, token = this.token): Promise<void> {
    const c = readSurroundColour(meta)
    const far = this.far
    if (!c || !this.gpu || !far) return
    const url = `${c.url}${c.url.includes('?') ? '&' : '?'}v=${encodeURIComponent(meta.pickedAt)}`
    const got = await loadColour({ ...c, url }, this.gpu, this.decoder, () => token !== this.token || this.far !== far)
    if (token !== this.token || this.far !== far) { got?.texture.dispose(); return }
    if (!got) { this.colour = { width: 0, fellBack: 'nothing fits or loads: 2048 colour kept' }; return }
    setFarColour(far, got.texture)
    // a second load replaces the first: free the old hi-res texture now, not when the meshes go
    this.textures = this.textures.filter((t) => { if (t !== this.hires) return true; t.dispose(); return false })
    this.hires = got.texture
    this.textures.push(got.texture)
    this.colour = got.state
  }

  /** Build the far mesh (and the dome, outdoors) from decoded data. */
  setData(d: SurroundData): void {
    this.dropMeshes()
    const { meta } = d
    this.meta = meta
    const [w, h] = [meta.width, meta.height]
    const geo = buildFarGeometry(d.dist, w, h, meta.up, { interior: meta.interior })
    const colour = panoTexture(rgbaOf(d.rgb, d.channels, w * h), w, h)
    this.far = farMesh(geo, colour)
    this.raw = { position: geo.position, cols: geo.cols, rows: geo.rows }
    const floor = readSurroundFloor(meta)
    this.surFloor = floor ? surroundFloorPlane(floor, upOf(meta)) : null
    this.applyGround()
    this.group.add(this.far)
    this.textures = [colour]
    if (!meta.interior) {
      const sky = panoTexture(buildDomeTexture(d.rgb, d.channels, d.dist, w, h), w, h)
      this.dome = domeMesh(sky)
      this.scene.add(this.dome)
      this.textures.push(sky)
    }
    this.setClay(this.clay)
  }

  /** Clay look on or off; meshes built later (a new world) follow too. */
  setClay(on: boolean): void {
    this.clay = on
    if (this.far) setFarClay(this.far, on)
    if (this.dome) setDomeClay(this.dome, on)
  }

  /**
   * The set's floor (projector camera space, app units before the root scale; null = no ground match) and the still's
   * frustum, inside which objects keep their still-alignment.
   */
  setSetFloor(plane: FloorPlane | null, foot: Footprint | null = null): void {
    this.setFloor = plane
    this.foot = foot
    this.applyGround()
  }

  /** whether the far ground is matched to the set's now */
  get groundMatched(): boolean { return !!(this.far && this.setFloor && this.surFloor) }

  private applyGround() {
    const r = this.raw
    if (!this.far || !r) return
    setFarPositions(this.far, this.setFloor && this.surFloor ? matchGround(r.position, r.cols, r.rows, this.setFloor, this.surFloor.up, this.foot) : r.position)
  }

  clear() {
    this.token++
    this.locationId = null
    this.dropMeshes()
  }

  private dropMeshes() {
    for (const m of [this.far, this.dome]) {
      if (!m) continue
      unswapClay(m) // the surround's own material back first: it is the one freed below
      m.removeFromParent()
      m.geometry.dispose()
      ;(m.material as Material).dispose()
    }
    for (const t of this.textures) t.dispose()
    this.far = this.dome = null
    this.meta = null
    this.raw = this.surFloor = this.hires = null
    this.textures = []
    this.colour = { width: 0, fellBack: null }
  }

  /** Follow the projector (times the root scale) and the camera, and take the main scene's background / override material for this draw. */
  prepare(camera: Camera, scene: Scene) {
    this.projector.updateMatrixWorld(true)
    this.group.matrix.copy(this.projector.matrixWorld)
    if (this.rootScale !== 1) this.group.matrix.multiply(new Matrix4().makeScale(this.rootScale, this.rootScale, this.rootScale))
    this.group.matrixWorldNeedsUpdate = true
    this.scene.background = scene.background
    this.scene.overrideMaterial = scene.overrideMaterial
    if (this.dome && this.meta) poseDome(this.dome, camera, this.projector, upOf(this.meta))
    this.scene.updateMatrixWorld(true)
  }

  dispose() {
    if (typeof window !== 'undefined') window.removeEventListener('surround:changed', this.onChanged)
    this.clear()
  }
}

/**
 * Draw `draw` (which renders `scene` from `camera`) with the layer behind it: far scene, clear depth, the set. The far scene
 * draws the main scene's background, so the main one is blanked for the set's draw and put back.
 */
export function layered(renderer: DrawTarget, scene: Scene, camera: Camera, layer: SurroundLayer | null, draw: () => void, opts: { clear: boolean }): void {
  if (!layer?.ready) return draw()
  const autoClear = renderer.autoClear
  const background = scene.background
  renderer.autoClear = false
  try {
    if (opts.clear) renderer.clear()
    layer.prepare(camera, scene)
    scene.background = null
    renderer.render(layer.scene, camera)
    renderer.clearDepth()
    draw()
  } finally {
    scene.background = background
    renderer.autoClear = autoClear
  }
}

/** The far layer the live view puts behind `scene`: none when the layer is hidden, `skip` is set, or the view shows the set's own holes. */
export function liveLayer(layer: SurroundLayer, scene: Scene, skip: boolean): SurroundLayer | null {
  return layer.visible && !skip && !HOLE_BACKGROUND(scene.background) ? layer : null
}

/**
 * The live view's draw straight to the canvas: skipped when the layer is hidden, empty, or the view shows the set's own
 * holes / the truth scene.
 */
export function drawLive(layer: SurroundLayer, renderer: DrawTarget, scene: Scene, camera: Camera, skip: boolean, draw: () => void): void {
  layered(renderer, scene, camera, liveLayer(layer, scene, skip), draw, { clear: true })
}

/** The far layer a capture of `scene` should include: only inside `captureOn`. */
export function captureLayer(scene: Scene): SurroundLayer | null {
  const l = scene.userData.surround as SurroundLayer | undefined
  return l?.inCapture ? l : null
}

/** Run `fn` (the warp export's render) with the stage's far layer included; stages without one just run it. */
export function withSurroundCapture<T>(stage: { surround?: SurroundLayer }, fn: () => T): T {
  return stage.surround ? stage.surround.captureOn(fn) : fn()
}
