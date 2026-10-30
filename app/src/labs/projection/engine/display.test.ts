import { Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { Display, type Overlay } from './display'

const overlay = (): Overlay & { toggles: number } => {
  const o = { object: new Group(), visible: true, toggles: 0, setVisible(on: boolean) { o.visible = on; o.toggles++ } }
  return o
}

describe('Display', () => {
  it('captures see the meshes and no overlays, then the user choice comes back (Splats view)', () => {
    const mesh = new Mesh()
    const layer = new Mesh()
    const d = new Display(() => [mesh, layer, null])
    const splat = overlay()
    d.add(splat)
    d.setMeshVisible(false)
    expect([mesh.visible, layer.visible, splat.visible]).toEqual([false, false, true])
    const seen = d.around(() => [mesh.visible, layer.visible, splat.visible])
    expect(seen).toEqual([true, true, false])
    expect([mesh.visible, layer.visible, splat.visible]).toEqual([false, false, true])
  })
  it('restores after a capture that throws, and leaves hidden overlays hidden', () => {
    const mesh = new Mesh()
    const d = new Display(() => [mesh])
    const shown = overlay(), hidden = overlay()
    hidden.setVisible(false)
    d.add(shown); d.add(hidden)
    d.setMeshVisible(false)
    expect(() => d.around(() => { throw new Error('export failed') })).toThrow('export failed')
    expect([mesh.visible, shown.visible, hidden.visible]).toEqual([false, true, false])
    expect(hidden.toggles).toBe(1)
  })
  it('a mesh made later follows the choice once applied; removed overlays are left alone', () => {
    let meshes: Mesh[] = []
    const d = new Display(() => meshes)
    d.setMeshVisible(false)
    meshes = [new Mesh()]
    d.applyMeshes()
    expect(meshes[0].visible).toBe(false)
    const o = overlay()
    d.add(o); d.remove(o)
    d.around(() => expect(o.visible).toBe(true))
    expect(d.overlayCount).toBe(0)
  })
})
