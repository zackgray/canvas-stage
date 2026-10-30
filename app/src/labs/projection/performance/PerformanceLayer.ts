// The performance as a world-clock layer: the pack's source camera (the set's projector when the clip was lifted) with
// the current frame's actor mesh under it, textured with that frame's colour. Every frame is decoded once at load and
// kept only as its actor crop (colour as the texture's data, depth as raw 16-bit); a frame's mesh is built and its
// texture uploaded when it is first shown, and kept in a small LRU cache: evicting a frame frees its mesh and its GPU
// texture, so the GPU holds MESH_CACHE frames however long the pack is, and playback re-meshes only frames it has not
// shown recently.
// From the source camera every actor vertex sits on its own pixel centre with that pixel's colour: an exact replay.
import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, PerspectiveCamera,
  SRGBColorSpace, type Vector3,
} from 'three'
import type { PerformancePack } from '../../../project/performance'
import type { ClockLayer } from '../world/World'
import { actorCentre, frameCentre } from './actorCentre'
import { actorGeometry, geometryBytes, type ActorGeometry } from './actorMesh'
import { cropBytes, type ActorCrop } from './decode'
import { frameAt, performanceDuration } from './frames'
import type { ClayTarget } from '../engine/clay'
import { setPerformerClay } from '../engine/clayMaterials'
import { unswapClay } from '../engine/claySwap'

/** meshes kept built (≈ a third of a second at 24 fps; every frame of a short pack scrubbed back and forth costs a rebuild) */
export const MESH_CACHE = 12

export interface LayerStats {
  frames: number
  /** decoded crops on the CPU (colour + raw depth) */
  cpuBytes: number
  /** colour textures of the cached frames (on the GPU) */
  textureBytes: number
  /** the cached meshes' buffers */
  meshBytes: number
  meshes: number
  /** mean / max time to mesh a frame (ms), over the frames meshed so far */
  buildMs: { mean: number; max: number; count: number }
}

function cropTexture(c: ActorCrop): DataTexture | null {
  if (!c.w || !c.h) return null
  const stride = c.w * 4
  const flipped = new Uint8Array(c.rgba.length) // bottom row first: uv (0,0) is bottom-left
  for (let y = 0; y < c.h; y++) flipped.set(c.rgba.subarray(y * stride, (y + 1) * stride), (c.h - 1 - y) * stride)
  const t = new DataTexture(flipped, c.w, c.h)
  t.colorSpace = SRGBColorSpace
  t.minFilter = LinearFilter
  t.magFilter = LinearFilter
  t.needsUpdate = true
  return t
}

export class PerformanceLayer implements ClockLayer, ClayTarget {
  readonly object = new Group()
  readonly camera: PerspectiveCamera
  readonly duration: number
  readonly pack: PerformancePack
  /** the frame shown (-1 before the first pose) */
  current = -1
  /** called with the frame index whenever a new frame is shown (the 3D-bodies preview follows the sheets' clock through it) */
  onFrame: ((i: number) => void) | null = null
  private actorsVisible = true
  /** the Clay look is on: frame meshes draw grey from smoothed normals (preview only; Look turns it off for captures) */
  private clay = false
  /** how long fetching + decoding the pack took (ms; set by the loader) */
  loadMs = 0
  private readonly crops: ActorCrop[]
  private readonly textures: (DataTexture | null)[]
  private readonly cache = new Map<number, { mesh: Mesh; bytes: number }>()
  private builds: number[] = []
  private shown: Mesh | null = null
  /** grid step (px) of the actor mesh; 1 = a vertex per pixel (exact replay) */
  private readonly step: number
  /** the clip's actor centre in source-camera space (undefined until first asked) */
  private centre: Vector3 | null | undefined

  constructor(pack: PerformancePack, crops: ActorCrop[], step = 1) {
    this.step = step
    if (crops.length !== pack.frames) throw new Error(`${pack.id}: ${crops.length} frames decoded, manifest says ${pack.frames}`)
    this.pack = pack
    this.crops = crops
    this.duration = performanceDuration(pack)
    this.object.name = `performance:${pack.id}`
    this.object.userData.clayTarget = this // the Look finds it here
    const s = pack.source
    this.camera = new PerspectiveCamera(s.vfovDeg, s.aspect, 0.02, 2000)
    this.camera.position.fromArray(s.position)
    this.camera.quaternion.fromArray(s.quaternion)
    this.camera.updateProjectionMatrix()
    this.object.add(this.camera)
    this.textures = crops.map(cropTexture)
    for (const c of crops) c.rgba = new Uint8Array(0) // the texture holds the colour now
  }

  /** Show the frame for world time t (round(t·fps); the last frame holds after the end). */
  pose(t: number) {
    this.show(frameAt(t, this.pack))
  }

  show(i: number) {
    if (i === this.current) return
    this.current = i
    if (this.shown) this.camera.remove(this.shown)
    this.shown = null
    this.shown = i >= 0 ? this.meshFor(i) : null
    if (this.shown) { this.shown.visible = this.actorsVisible; this.camera.add(this.shown) }
    this.onFrame?.(i)
  }

  /** Clay look on or off: every cached frame mesh follows, and frames built later too. */
  setClay(on: boolean) {
    this.clay = on
    for (const e of this.cache.values()) setPerformerClay(e.mesh, on)
  }

  /** Hide / show the actor cut-out sheets (the 3D-bodies preview replaces them). */
  setActorsVisible(v: boolean) {
    this.actorsVisible = v
    if (this.shown) this.shown.visible = v
  }

  /** The actors' centre over the whole clip, in world space: the orbit pivot. One point per clip (never per frame). */
  pivot(): Vector3 | null {
    if (this.centre === undefined) {
      const full = { width: this.pack.width, height: this.pack.height, vfovDeg: this.pack.source.vfovDeg }
      this.centre = actorCentre(this.crops, full)
    }
    if (!this.centre) return null
    this.camera.updateWorldMatrix(true, false)
    return this.camera.localToWorld(this.centre.clone())
  }

  /** The actors' centre in frame t's own crop, in world space (the pivot when that frame has no actors): where the performer is then. */
  chestAt(t: number): Vector3 | null {
    const crop = this.crops[Math.max(0, frameAt(t, this.pack))]
    const c = crop && frameCentre(crop, { width: this.pack.width, height: this.pack.height, vfovDeg: this.pack.source.vfovDeg })
    if (!c) return this.pivot()
    this.camera.updateWorldMatrix(true, false)
    return this.camera.localToWorld(c)
  }

  /** The actor geometry of frame i (built fresh; for tests and exports that need the numbers). */
  geometryOf(i: number): ActorGeometry {
    return actorGeometry(this.crops[i], { width: this.pack.width, height: this.pack.height, vfovDeg: this.pack.source.vfovDeg }, this.step)
  }

  private meshFor(i: number): Mesh | null {
    const hit = this.cache.get(i)
    if (hit) {
      this.cache.delete(i) // most recent last
      this.cache.set(i, hit)
      return hit.mesh
    }
    const tex = this.textures[i]
    if (!tex) return null
    const t0 = performance.now()
    const g = this.geometryOf(i)
    this.builds.push(performance.now() - t0)
    if (!g.triangles) return null
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(g.positions, 3))
    geo.setAttribute('uv', new BufferAttribute(g.uvs, 2))
    geo.setIndex(new BufferAttribute(g.indices, 1))
    const mesh = new Mesh(geo, new MeshBasicMaterial({ map: tex, side: DoubleSide }))
    mesh.frustumCulled = false
    mesh.name = `performance-frame-${i}`
    if (this.clay) setPerformerClay(mesh, true)
    this.cache.set(i, { mesh, bytes: geometryBytes(g) })
    while (this.cache.size > MESH_CACHE) {
      const [old, entry] = this.cache.entries().next().value!
      this.cache.delete(old)
      this.free(entry.mesh)
    }
    return mesh
  }

  private free(mesh: Mesh) {
    unswapClay(mesh) // the colour material back first: it is the one this layer frees
    mesh.removeFromParent()
    mesh.geometry.dispose()
    const m = mesh.material as MeshBasicMaterial
    m.map?.dispose() // GPU copy only: the data stays, and uploads again if the frame comes back
    m.dispose()
  }

  stats(): LayerStats {
    const b = this.builds
    let meshBytes = 0, textureBytes = 0
    for (const [i, e] of this.cache) { meshBytes += e.bytes; textureBytes += this.texBytes(i) }
    return {
      frames: this.crops.length,
      cpuBytes: this.crops.reduce((s, c, i) => s + cropBytes(c) + this.texBytes(i), 0),
      textureBytes,
      meshBytes,
      meshes: this.cache.size,
      buildMs: { mean: b.length ? b.reduce((s, x) => s + x, 0) / b.length : 0, max: b.length ? Math.max(...b) : 0, count: b.length },
    }
  }

  private texBytes(i: number) {
    const t = this.textures[i]
    return t ? t.image.width * t.image.height * 4 : 0
  }

  dispose() {
    for (const e of this.cache.values()) this.free(e.mesh)
    this.cache.clear()
    for (const t of this.textures) t?.dispose()
    this.object.removeFromParent()
    this.shown = null
    this.current = -1
  }
}
