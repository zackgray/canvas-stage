// A Gaussian-splat display of one projector (original or settled), rendered by Spark alongside the meshes.
// Display only: captures and exports stay mesh-based, so hide the layer around them (setVisible(false)).
//
// Spark draws every SplatMesh in a scene through one SparkRenderer that must itself be in the scene. Layers share
// one per WebGLRenderer, attached to whatever root the first layer is added under and removed with the last layer.

import { Group, type Object3D, type PerspectiveCamera, type WebGLRenderer } from 'three'
import { PackedSplats, SparkRenderer, SplatMesh } from '@sparkjsdev/spark'
import type { ProjectorLayer } from '../engine/settled'
import type { ProjectionSource } from '../engine/Stage'
import { depthToSplats, type DepthSplats } from './fromDepth'
import { pack } from './pack'
import { settledInput, sourceInput, type SplatInput, type SplatLayerOptions } from './inputs'

export type { SplatInput, SplatLayerOptions } from './inputs'

interface Shared { spark: SparkRenderer; layers: Set<SplatLayer> }
const shared = new WeakMap<WebGLRenderer, Shared>()

const rootOf = (o: Object3D) => { let r = o; while (r.parent) r = r.parent; return r }

export class SplatLayer {
  /** add to stage.scene */
  readonly object = new Group()
  readonly count: number
  /** CPU bytes of the packed splat buffers (the GPU textures are the same size) */
  readonly bytes: number
  readonly dropped: DepthSplats['dropped']
  private readonly mesh: SplatMesh
  private readonly renderer: WebGLRenderer

  constructor(renderer: WebGLRenderer, input: SplatInput) {
    this.renderer = renderer
    const splats = depthToSplats(input, input.options)
    this.count = splats.count
    this.dropped = splats.dropped
    const { source, bytes } = pack(splats, input.options?.packed ?? false)
    this.bytes = bytes
    this.mesh = source instanceof PackedSplats
      ? new SplatMesh({ packedSplats: source, raycastable: false })
      : new SplatMesh({ extSplats: source, raycastable: false })
    // splats are in projector camera space; the mesh carries the projector's world pose
    this.mesh.position.copy(input.position)
    this.mesh.quaternion.copy(input.quaternion)
    this.object.name = 'splat-layer'
    this.object.add(this.mesh)
    let entry = shared.get(renderer)
    if (!entry) {
      entry = { spark: new SparkRenderer({ renderer }), layers: new Set() }
      shared.set(renderer, entry)
    }
    entry.layers.add(this)
    this.object.addEventListener('added', this.attach)
  }

  /** Splats for the lab's original projector (`stage.source`, `stage.projector`). */
  static fromSource(renderer: WebGLRenderer, source: ProjectionSource, projector: PerspectiveCamera, options?: SplatLayerOptions) {
    return new SplatLayer(renderer, sourceInput(source, projector, options))
  }

  /** Splats for a settled projector, inside its grown hole mask; `sharpen` as passed to ProjectorLayer. */
  static fromSettled(renderer: WebGLRenderer, layer: ProjectorLayer, sharpen: number, options?: SplatLayerOptions) {
    return new SplatLayer(renderer, settledInput(layer, sharpen, options))
  }

  /** Make sure the shared SparkRenderer sits in the scene this layer was added to. */
  private attach = () => {
    const entry = shared.get(this.renderer)
    if (!entry) return
    const root = rootOf(this.object)
    if (entry.spark.parent !== root) root.add(entry.spark)
    this.syncVisibility(entry)
  }

  get visible() { return this.object.visible }

  setVisible(on: boolean) {
    this.object.visible = on
    const entry = shared.get(this.renderer)
    if (entry) this.syncVisibility(entry)
  }

  /** The SparkRenderer only runs while some layer is showing. */
  private syncVisibility(entry: Shared) {
    entry.spark.visible = [...entry.layers].some((l) => l.object.visible && !!l.object.parent)
  }

  dispose() {
    this.object.removeEventListener('added', this.attach)
    this.object.removeFromParent()
    this.mesh.dispose()
    const entry = shared.get(this.renderer)
    if (!entry) return
    entry.layers.delete(this)
    if (entry.layers.size) return this.syncVisibility(entry)
    entry.spark.removeFromParent()
    entry.spark.dispose()
    shared.delete(this.renderer)
  }
}
