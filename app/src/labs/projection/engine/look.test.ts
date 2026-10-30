import { Group, Matrix4, Mesh, Scene, type ShaderMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import type { Overlay } from './display'
import { createProjectionMaterial } from './materials'
import { PUSH_BACK } from './settled'
import { Viewport } from './viewport'

const overlay = (): Overlay => {
  const o = { object: new Group(), visible: true, setVisible(on: boolean) { o.visible = on } }
  return o
}
const projMesh = (pushBack = 0) => new Mesh(undefined, createProjectionMaterial(new Matrix4(), pushBack))
const blocking = (m: Mesh) => (m.material as ShaderMaterial).uniforms.blocking.value as number

/** The stage's arrangement: the original mesh, settled layers (pushed back) and the pivot marker, on a real Viewport. */
function rig() {
  const scene = new Scene()
  const original = projMesh()
  const layers: Mesh[] = [projMesh(PUSH_BACK)]
  const marker = new Mesh()
  marker.visible = true
  const vp = new Viewport(scene, () => [original, ...layers], marker)
  // what Stage.addLayer does after pushing the layer
  const addLayer = () => { const m = projMesh(PUSH_BACK); layers.push(m); vp.applyMeshes(); return m }
  const all = () => [original, ...layers]
  return { scene, original, layers, marker, vp, addLayer, all }
}

describe('Look', () => {
  it('Blocking reaches the original, every settled layer, and layers added while in Blocking (auto-fill)', () => {
    const r = rig()
    expect(r.all().map(blocking)).toEqual([0, 0])
    r.vp.look.set('blocking')
    expect(r.all().map(blocking)).toEqual([1, 1])
    const later = r.addLayer()
    expect(blocking(later)).toBe(1)
    r.vp.look.set('textured')
    expect(r.all().map(blocking)).toEqual([0, 0, 0])
  })

  it('landing on a new set while in Blocking keeps Blocking: the rebuilt mesh comes up grey', () => {
    const scene = new Scene()
    let current = projMesh()
    const vp = new Viewport(scene, () => [current], new Mesh())
    vp.look.set('blocking')
    current = projMesh() // what Stage.rebuild does for a new source, then applyMeshes
    vp.applyMeshes()
    expect([vp.look.mode, blocking(current)]).toEqual(['blocking', 1])
    expect(vp.offscreen(() => blocking(current))).toBe(0)
  })

  it('a capture in Blocking renders textured, gizmo and marker hidden, then the grey comes back', () => {
    const r = rig()
    r.vp.look.set('blocking')
    const seen = r.vp.offscreen(() => ({
      looks: r.all().map(blocking), gizmo: r.vp.gizmo.visible, marker: r.marker.visible, meshes: r.all().map((m) => m.visible),
    }))
    expect(seen).toEqual({ looks: [0, 0], gizmo: false, marker: false, meshes: [true, true] })
    expect(r.all().map(blocking)).toEqual([1, 1])
    expect([r.vp.gizmo.visible, r.marker.visible]).toEqual([true, true])
  })

  it('restores Blocking after a capture that throws', () => {
    const r = rig()
    r.vp.look.set('blocking')
    expect(() => r.vp.offscreen(() => { throw new Error('export failed') })).toThrow('export failed')
    expect(r.all().map(blocking)).toEqual([1, 1])
  })

  it('Blocking shows the meshes alone in Splats view, splats added meanwhile stay hidden, Textured restores exactly', () => {
    const r = rig()
    const splat = overlay()
    r.vp.display.add(splat)
    r.vp.display.setMeshVisible(false) // Splats view
    r.vp.look.set('blocking')
    expect([...r.all().map((m) => m.visible), splat.visible]).toEqual([true, true, false])
    const late = overlay()
    r.vp.display.add(late) // a splat layer rebuilt or added while in Blocking
    r.vp.display.setMeshVisible(false) // SplatView re-asserting its choice after a reconcile
    expect([late.visible, r.original.visible]).toEqual([false, true])
    const during = r.vp.offscreen(() => [blocking(r.original), splat.visible, late.visible, r.original.visible])
    expect(during).toEqual([0, false, false, true])
    r.vp.look.set('textured')
    expect([...r.all().map((m) => m.visible), splat.visible, late.visible]).toEqual([false, false, true, true])
    expect(r.all().map(blocking)).toEqual([0, 0])
  })

  it('hole mask holds in both looks: magenta background, gizmo kept hidden across captures', () => {
    const r = rig()
    const dark = r.scene.background
    r.vp.look.set('blocking')
    r.vp.setHoleMask(true)
    expect(r.scene.background).not.toBe(dark)
    r.vp.offscreen(() => undefined)
    expect(r.vp.gizmo.visible).toBe(false)
    r.vp.look.set('textured')
    r.vp.setHoleMask(false)
    expect([r.scene.background, r.vp.gizmo.visible]).toEqual([dark, true])
  })

  it('repeated switches allocate and dispose nothing: same materials, same scene', () => {
    const r = rig()
    const mats = r.all().map((m) => m.material)
    let disposed = 0
    for (const m of mats) (m as ShaderMaterial).addEventListener('dispose', () => disposed++)
    const children = r.scene.children.length
    for (let i = 0; i < 50; i++) {
      r.vp.look.set(i % 2 ? 'textured' : 'blocking')
      r.vp.offscreen(() => undefined)
    }
    r.vp.look.set('textured')
    expect(r.all().map((m) => m.material)).toEqual(mats)
    expect(disposed).toBe(0)
    expect(r.scene.children).toHaveLength(children)
    expect(r.all().map(blocking)).toEqual([0, 0])
  })
})
