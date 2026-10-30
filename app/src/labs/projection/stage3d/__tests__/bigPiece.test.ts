// A generated set piece grown to tens of metres (owner 2026-10-29, the grandstand) is that size everywhere the render reads the set:
// the master still's own world (buildWorld from the plan), the live layer an edit applies in place (which the clay, its depth and
// the ID pass draw), and the massing clay (the massing mesh rides the same root). The fixture is a 2 x 1 x 0.5 box.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import type { KitItem, ScenePlan } from '../../../../stage3d/contract'
import { parseGlb, setGlbLoader, setMassing, type GlbLoad } from '../../../../stage3d/glbPiece'
import { PLANS } from '../../../../stage3d/presets'
import { buildWorld } from '../../../../stage3d/world'
import { KitLayer } from '../KitLayer'

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'stage3d', '__tests__', 'fixtures', 'piece-box.glb')
const load: GlbLoad = async () => { const b = readFileSync(FIXTURE); return parseGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) }
let restore: GlbLoad | null = null
afterEach(() => { if (restore) setGlbLoader(restore); restore = null })

const stand = (scale: number): KitItem => ({
  kind: 'grandstand', at: [0, -40], yawDeg: 0, scale, pieceTag: 'prop:grandstand',
  glb: { url: '/lab-assets/locations/loc-x/pieces/grandstand/p-1/mesh.glb', massingUrl: '/lab-assets/locations/loc-x/pieces/grandstand/p-1/massing.glb', yawOffsetDeg: 0, unitScale: 1 },
})
const plan = (scale: number): ScenePlan => ({ ...(JSON.parse(JSON.stringify(PLANS['open-field-day'])) as ScenePlan), puddles: 0, tufts: 0, kit: [stand(scale)] })
const sizeOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
/** how far a ray from the view, level along -z 0.25 m above the piece's ground, travels before it meets the piece */
const reach = (layer: KitLayer) => {
  layer.group.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(new THREE.Vector3(0, layer.groundAt(0, -40) + 0.25, 0), new THREE.Vector3(0, 0, -1))
  return ray.intersectObject(layer.rootOf(0)!, true)[0]?.distance ?? null
}

describe('a set piece grown to grandstand size', () => {
  it('the master still\'s world builds it at 30x: 60 m wide, 30 m tall', async () => {
    restore = setGlbLoader(load)
    const w = buildWorld(plan(30))
    await w.ready
    const s = sizeOf(w.scene.getObjectByName('prop:grandstand')!)
    expect(s.x).toBeCloseTo(60, 2); expect(s.y).toBeCloseTo(30, 2); expect(s.z).toBeCloseTo(15, 2)
    w.dispose()
  })

  it('an edit applied in place grows the live piece, its massing too, and a ray from the view meets its new front face', async () => {
    restore = setGlbLoader(load)
    const w = buildWorld(plan(1))
    await w.ready
    const layer = new KitLayer(w, 'loc-x', plan(1), { path: [[0, 0], [0, 0.2]], stand: true } as never)
    const root = layer.rootOf(0)!
    expect(root.name).toBe('prop:grandstand')
    const far = reach(layer)!
    expect(far).toBeCloseTo(40 - 0.25, 1) // the 0.5 m deep box's front at z = -39.75
    layer.applyPlan(plan(30))
    expect(layer.rootOf(0)).toBe(root) // the same object, grown in place: nothing reloads
    expect(sizeOf(root).x).toBeCloseTo(60, 2)
    expect(reach(layer)!).toBeCloseTo(40 - 7.5, 1) // the depth now reads the 15 m deep stand's front face
    expect(setMassing(layer.group, true)).toBe(1)
    expect(sizeOf(root).x).toBeCloseTo(60, 2) // the massing clay is the grown one too
    setMassing(layer.group, false)
    layer.dispose()
  })
})
