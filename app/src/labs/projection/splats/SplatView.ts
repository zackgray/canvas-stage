// The lab's View: Mesh | Splats | Both. Keeps one splat layer for the original projector and one per settled
// projector in step with the stage, builds nothing until a splat view is picked, and loads Spark (~2.6 MB) lazily.
// Splat layers are snapshots: a mesh rebuild drops the original's, an option change drops them all; the next
// reconcile (one per task, so a burst of invalidations builds once) rebuilds what is missing.

import type { Overlay } from '../engine/display'
import type { ProjectorLayer } from '../engine/settled'
import type { Stage } from '../engine/Stage'
import type { SplatLayerOptions } from './inputs'

export type ViewMode = 'mesh' | 'splats' | 'both'
export const VIEW_MODES: readonly ViewMode[] = ['mesh', 'splats', 'both']
export const STRIDES = [1, 2, 4] as const

export interface SplatLike extends Overlay {
  readonly count: number
  /** CPU bytes of the splat buffers */
  readonly bytes: number
  dispose(): void
}

/** What the view needs from the stage (Stage implements it; tests fake it). */
export type SplatHost = Pick<Stage, 'renderer' | 'source' | 'projector' | 'layers' | 'setMeshVisible' | 'addOverlay' | 'removeOverlay' | 'onChange'>

export interface SplatFactory {
  fromSource(host: SplatHost, options: SplatLayerOptions): SplatLike | null
  fromSettled(host: SplatHost, layer: ProjectorLayer, sharpen: number, options: SplatLayerOptions): SplatLike
}

/** Spark is only fetched when a splat view is first picked. */
export async function loadSpark(): Promise<SplatFactory> {
  const { SplatLayer } = await import('./SplatLayer')
  return {
    fromSource: (h, o) => (h.source ? SplatLayer.fromSource(h.renderer, h.source, h.projector, o) : null),
    fromSettled: (h, l, sharpen, o) => SplatLayer.fromSettled(h.renderer, l, sharpen, o),
  }
}

export interface SplatViewOptions {
  stride: number
  /** the grid's edge cut and plane-aware flag, so splats drop where the mesh cuts */
  edgeThreshold: number
  planeAware: boolean
  /** soft-edge snapping radius the settled meshes use */
  sharpen: number
}

export interface SplatStats {
  mode: ViewMode
  loading: boolean
  /** splat layers alive (original + settled) */
  layers: number
  count: number
  bytes: number
  error: string | null
}

export class SplatView {
  private mode: ViewMode = 'mesh'
  private factory: SplatFactory | null = null
  private loading = false
  private main: SplatLike | null = null
  private readonly settled = new Map<ProjectorLayer, SplatLike>()
  private error: string | null = null
  private queued = false
  private disposed = false
  private opts: SplatViewOptions
  private readonly host: SplatHost
  private readonly onStats: (s: SplatStats) => void
  private readonly load: () => Promise<SplatFactory>
  private readonly off: () => void

  constructor(host: SplatHost, opts: SplatViewOptions, onStats: (s: SplatStats) => void, load: () => Promise<SplatFactory> = loadSpark) {
    this.host = host
    this.opts = opts
    this.onStats = onStats
    this.load = load
    this.off = host.onChange((what) => {
      if (what === 'rebuild') this.drop(this.main)
      this.schedule()
    })
  }

  get stats(): SplatStats {
    const all = this.layers()
    return {
      mode: this.mode, loading: this.loading, layers: all.length, error: this.error,
      count: all.reduce((n, l) => n + l.count, 0), bytes: all.reduce((n, l) => n + l.bytes, 0),
    }
  }

  setMode(mode: ViewMode) {
    if (mode === this.mode) return
    this.mode = mode
    this.host.setMeshVisible(mode !== 'splats' || !!this.error)
    if (mode === 'mesh') this.dropAll() // nothing kept around while unseen
    this.schedule()
  }

  setOptions(opts: SplatViewOptions) {
    const o = this.opts
    if (o.stride === opts.stride && o.edgeThreshold === opts.edgeThreshold && o.planeAware === opts.planeAware && o.sharpen === opts.sharpen) return
    this.opts = opts
    this.dropAll()
    this.schedule()
  }

  dispose() {
    this.disposed = true
    this.off()
    this.dropAll()
    this.host.setMeshVisible(true)
  }

  /** Reconcile once at the end of this task (rebuild + option change in one React commit build once). */
  private schedule() {
    if (this.queued) return
    this.queued = true
    queueMicrotask(() => { this.queued = false; this.reconcile() })
  }

  private reconcile() {
    if (this.disposed) return
    if (this.mode === 'mesh' || !this.factory) {
      if (this.mode !== 'mesh') void this.fetch()
      return this.emit()
    }
    const f = this.factory, h = this.host
    const options: SplatLayerOptions = { stride: this.opts.stride, edgeThreshold: this.opts.edgeThreshold, planeAware: this.opts.planeAware }
    try {
      if (!this.main && h.source) {
        this.main = f.fromSource(h, options)
        if (this.main) h.addOverlay(this.main)
      }
      const live = new Set(h.layers)
      for (const [layer, s] of this.settled) if (!live.has(layer)) { this.settled.delete(layer); this.drop(s) }
      for (const layer of h.layers) {
        if (this.settled.has(layer)) continue
        const s = f.fromSettled(h, layer, this.opts.sharpen, options)
        h.addOverlay(s)
        this.settled.set(layer, s)
      }
      this.error = null
    } catch (e) {
      this.error = `splats failed: ${e instanceof Error ? e.message : String(e)}`
    }
    this.host.setMeshVisible(this.mode !== 'splats' || !!this.error)
    this.emit()
  }

  private async fetch() {
    if (this.loading) return
    this.loading = true
    this.emit()
    try {
      this.factory = await this.load()
    } catch (e) {
      this.error = `Spark failed to load: ${e instanceof Error ? e.message : String(e)}`
      this.host.setMeshVisible(true)
    }
    this.loading = false
    if (this.factory) this.reconcile()
    else this.emit()
  }

  private layers(): SplatLike[] {
    return [...(this.main ? [this.main] : []), ...this.settled.values()]
  }

  private drop(s: SplatLike | null) {
    if (!s) return
    if (s === this.main) this.main = null
    this.host.removeOverlay(s)
    s.dispose()
  }

  private dropAll() {
    this.drop(this.main)
    for (const s of this.settled.values()) this.drop(s)
    this.settled.clear()
  }

  private emit() {
    if (!this.disposed) this.onStats(this.stats)
  }
}
