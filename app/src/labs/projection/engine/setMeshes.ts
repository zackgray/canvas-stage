import type { Mesh, Object3D, PerspectiveCamera, Scene } from 'three'
import { buildGrid, type GridMesh, type GridOptions } from '../math/grid'
import { gridMesh } from './gridMesh'
import { createProjectionMaterial } from './materials'
import type { ProjectionSource } from './projectionSource'
import type { ProjectorLayer } from './settled'
import type { Viewport } from './viewport'

/** 'rebuild': the original projector's mesh was rebuilt; 'layers': settled projectors were added or cleared */
export type StageChange = 'rebuild' | 'layers'

/**
 * The projected set: the source still + depth, the original projector's displaced grid, and the settled projectors
 * stacked on it (the original wins where both have geometry). Listeners hear rebuilds and layer changes.
 */
export class SetMeshes {
  source: ProjectionSource | null = null
  grid: GridMesh | null = null
  readonly layers: ProjectorLayer[] = []
  private material: ReturnType<typeof createProjectionMaterial>
  private mesh: Mesh | null = null
  private listeners = new Set<(what: StageChange) => void>()
  private readonly scene: Scene
  private readonly projector: PerspectiveCamera
  private readonly viewport: () => Viewport
  /** what the original projector's mesh hangs under: the world root's scaled set group (worldRoot.ts), else the projector */
  private readonly parent: Object3D

  constructor(scene: Scene, projector: PerspectiveCamera, viewport: () => Viewport, parent: Object3D = projector) {
    this.scene = scene
    this.projector = projector
    this.viewport = viewport
    this.parent = parent
    this.material = createProjectionMaterial(projector.projectionMatrix)
  }

  readonly meshes = () => [this.mesh, ...this.layers.map((l) => l.mesh)]

  setSource(source: ProjectionSource | null) {
    if (this.source && this.source.texture !== source?.texture) this.source.texture.dispose()
    this.source = source
    this.material.uniforms.map.value = source?.texture ?? null
  }

  /** Rebuild the displaced grid for the current source and projector lens. */
  rebuild(options: GridOptions): GridMesh | null {
    if (this.mesh) {
      this.mesh.removeFromParent()
      this.mesh.geometry.dispose()
      this.mesh = null
    }
    const src = this.source
    if (!src) return (this.grid = null)
    const k = { width: src.depthWidth, height: src.depthHeight, vfov: (this.projector.fov * Math.PI) / 180 }
    const grid = buildGrid(k, src.depth, options)
    this.mesh = gridMesh(grid, this.material)
    this.parent.add(this.mesh)
    this.viewport().applyMeshes()
    this.viewport().updateGizmo(this.projector, src.depth, this.parent.scale.x)
    this.grid = grid
    this.emit('rebuild')
    return grid
  }

  addLayer(layer: ProjectorLayer) {
    this.layers.push(layer)
    this.scene.add(layer.camera)
    this.viewport().applyMeshes()
    this.emit('layers')
  }

  clearLayers() {
    for (const l of this.layers.splice(0)) l.dispose()
    this.emit('layers')
  }

  /** Listen for mesh rebuilds and settled-layer changes; returns the unsubscribe. */
  onChange(fn: (what: StageChange) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(what: StageChange) {
    for (const fn of this.listeners) fn(what)
  }

  dispose() {
    this.clearLayers()
    this.listeners.clear()
    this.mesh?.geometry.dispose()
    this.source?.texture.dispose()
    this.material.dispose()
  }
}
