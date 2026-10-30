import { Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { Display } from '../engine/display'
import type { ProjectorLayer } from '../engine/settled'
import type { StageChange } from '../engine/Stage'
import { SplatView, type SplatFactory, type SplatHost, type SplatLike, type SplatStats, type SplatViewOptions } from './SplatView'

const OPTS: SplatViewOptions = { stride: 2, edgeThreshold: 0.04, planeAware: true, sharpen: 3 }
const tick = () => new Promise((r) => setTimeout(r, 0))

/** A stage stand-in with the real Display (so captures can be checked) and a counting splat factory. */
function rig() {
  const mesh = new Mesh()
  const layers: ProjectorLayer[] = []
  const display = new Display(() => [mesh, ...layers.map((l) => l.mesh)])
  const listeners = new Set<(w: StageChange) => void>()
  const emit = (w: StageChange) => { for (const fn of listeners) fn(w) }
  const scene = new Group()
  const host = {
    renderer: null, source: {}, projector: null, layers,
    setMeshVisible: (on: boolean) => display.setMeshVisible(on),
    addOverlay: (o: SplatLike) => { scene.add(o.object); display.add(o) },
    removeOverlay: (o: SplatLike) => { display.remove(o); o.object.removeFromParent() },
    onChange: (fn: (w: StageChange) => void) => { listeners.add(fn); return () => listeners.delete(fn) },
  } as unknown as SplatHost
  const made: { kind: string; stride?: number; disposed: boolean; splat?: SplatLike }[] = []
  const make = (kind: string, stride?: number): SplatLike => {
    const rec = { kind, stride, disposed: false }
    made.push(rec)
    const s = {
      object: new Group(), visible: true, count: 1000, bytes: 32_000,
      setVisible(on: boolean) { s.visible = on },
      dispose() { rec.disposed = true },
    }
    Object.assign(rec, { splat: s })
    return s
  }
  let loads = 0
  const factory: SplatFactory = {
    fromSource: (_h, o) => make('source', o.stride),
    fromSettled: (_h, _l, _s, o) => make('settled', o.stride),
  }
  const load = async () => { loads++; return factory }
  let stats: SplatStats | null = null
  const view = new SplatView(host, OPTS, (s) => { stats = s }, load)
  const addLayer = () => { const l = { mesh: new Mesh() } as unknown as ProjectorLayer; layers.push(l); display.applyMeshes(); emit('layers') }
  const clearLayers = () => { layers.splice(0); emit('layers') }
  const live = () => made.filter((m) => !m.disposed)
  return {
    view, mesh, scene, display, made, live, addLayer, clearLayers, rebuild: () => emit('rebuild'),
    loads: () => loads, stats: () => stats!, layers,
  }
}

describe('SplatView', () => {
  it('Mesh view builds nothing and never loads Spark, whatever the sliders do', async () => {
    const r = rig()
    for (let i = 0; i < 5; i++) { r.rebuild(); r.view.setOptions({ ...OPTS, edgeThreshold: 0.04 + i / 100 }) }
    r.addLayer()
    await tick()
    expect(r.loads()).toBe(0)
    expect(r.made).toHaveLength(0)
    expect(r.mesh.visible).toBe(true)
  })

  it('Splats view loads Spark once, hides the meshes and builds the original + every settled projector', async () => {
    const r = rig()
    r.addLayer()
    r.view.setMode('splats')
    await tick()
    expect(r.loads()).toBe(1)
    expect(r.live().map((m) => m.kind)).toEqual(['source', 'settled'])
    expect([r.mesh.visible, r.layers[0].mesh.visible]).toEqual([false, false])
    expect(r.stats()).toMatchObject({ mode: 'splats', loading: false, layers: 2, count: 2000, bytes: 64_000, error: null })
    r.view.setMode('both')
    await tick()
    expect(r.mesh.visible).toBe(true)
    expect(r.loads()).toBe(1)
  })

  it('a settled layer added while in Splats view (auto-fill) gets its splats; clearing disposes them', async () => {
    const r = rig()
    r.view.setMode('splats')
    await tick()
    r.addLayer()
    await tick()
    expect(r.live().map((m) => m.kind)).toEqual(['source', 'settled'])
    expect(r.layers[0].mesh.visible).toBe(false) // the new mesh follows the view choice too
    r.clearLayers()
    await tick()
    expect(r.live().map((m) => m.kind)).toEqual(['source'])
    expect(r.scene.children).toHaveLength(1)
  })

  it('no leaks across rebuilds and option changes; a burst builds once; Mesh disposes everything', async () => {
    const r = rig()
    r.addLayer()
    r.view.setMode('splats')
    await tick()
    for (let i = 0; i < 10; i++) { r.rebuild(); await tick() }
    expect(r.live()).toHaveLength(2)
    expect(r.made.filter((m) => m.kind === 'source')).toHaveLength(11)
    expect(r.made.filter((m) => m.kind === 'settled')).toHaveLength(1) // a mesh rebuild leaves settled splats alone
    const before = r.made.length
    r.rebuild(); r.view.setOptions({ ...OPTS, stride: 4 }) // one React commit: lens change + stride change
    await tick()
    expect(r.made.length - before).toBe(2)
    expect(r.live().map((m) => m.stride)).toEqual([4, 4])
    expect(r.display.overlayCount).toBe(2)
    expect(r.scene.children).toHaveLength(2)
    r.view.setMode('mesh')
    await tick()
    expect(r.live()).toHaveLength(0)
    expect(r.display.overlayCount).toBe(0)
    expect(r.scene.children).toHaveLength(0)
    expect(r.mesh.visible).toBe(true)
  })

  it('a capture during Splats view renders the mesh, not the splats', async () => {
    const r = rig()
    r.addLayer()
    r.view.setMode('splats')
    await tick()
    const splats = () => r.live().map((m) => m.splat!.visible)
    expect([r.mesh.visible, ...splats()]).toEqual([false, true, true])
    // what Stage.offscreen wraps every export, still, auto-fill export, guide clip, round trip and hole probe in
    const during = r.display.around(() => ({ mesh: r.mesh.visible, layer: r.layers[0].mesh.visible, splats: splats() }))
    expect(during).toEqual({ mesh: true, layer: true, splats: [false, false] })
    expect([r.mesh.visible, r.layers[0].mesh.visible, ...splats()]).toEqual([false, false, true, true])
  })

  it('dispose shows the mesh again and frees every layer', async () => {
    const r = rig()
    r.view.setMode('splats')
    await tick()
    r.view.dispose()
    r.rebuild()
    await tick()
    expect(r.live()).toHaveLength(0)
    expect(r.mesh.visible).toBe(true)
  })
})
