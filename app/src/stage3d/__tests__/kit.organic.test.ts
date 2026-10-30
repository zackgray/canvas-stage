// S6: the treeline and haystacks must read as organic massing (uneven heights, several masses, modest poly counts), not cones and spheres.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { KIT, rng } from '../kit.ts'
import { FOLIAGE, FOLIAGE_FAR } from '../kit/common.ts'
import { bandTree } from '../kit/organic.ts'

const tris = (o: THREE.Object3D) => { let n = 0; o.traverse((m) => { const g = (m as THREE.Mesh).geometry as THREE.BufferGeometry | undefined; if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3 }); return n }
/** highest point of the mesh geometry in each 2 m slice along x */
function skyline(o: THREE.Object3D): number[] {
  o.updateMatrixWorld(true)
  const top = new Map<number, number>(), v = new THREE.Vector3()
  o.traverse((m) => {
    const mesh = m as THREE.Mesh
    if (!mesh.geometry) return
    const p = mesh.geometry.attributes.position
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld); const k = Math.round(v.x / 2); top.set(k, Math.max(top.get(k) ?? 0, v.y)) }
  })
  return [...top.values()]
}
const sd = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) }

describe('organic kit shapes', () => {
  it('the treeline has an uneven skyline and a modest triangle count', () => {
    const t = KIT.treeline(100, 1, 8)
    expect(sd(skyline(t))).toBeGreaterThan(0.8) // heights vary by metres along the band
    expect(tris(t)).toBeLessThan(40_000)
  })
  it('a tree is a trunk plus several canopy masses, not one cone or sphere', () => {
    const t = KIT.treeline(30, 3, 8)
    let meshes = 0; t.traverse((m) => { if ((m as THREE.Mesh).isMesh) meshes++ })
    expect(meshes).toBeGreaterThanOrEqual(2)
    expect(tris(t) / 30).toBeGreaterThan(50) // dozens of trees' worth of facets per metre of band
  })
  it('a band tree is a trunk under a crown of four or more scattered lobes, never one ball on a stick', () => {
    const r = rng(5)
    for (let k = 0; k < 20; k++) {
      const parts = bandTree(r, 0, 0, 8), crowns = parts.slice(1).map((g) => { g.computeBoundingBox(); return g.boundingBox!.getCenter(new THREE.Vector3()) })
      expect(crowns.length).toBeGreaterThanOrEqual(4)
      const xs = crowns.map((c) => c.x), ys = crowns.map((c) => c.y)
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5) // lobes spread sideways: a broken edge, not a stacked column
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.5)
    }
  })
  it('the treeline back row is paler, so it thins into the haze', () => {
    const mats = new Set<THREE.Material>(); KIT.treeline(100, 1, 8).traverse((m) => { if ((m as THREE.Mesh).isMesh) mats.add((m as THREE.Mesh).material as THREE.Material) })
    expect([...mats]).toEqual(expect.arrayContaining([FOLIAGE, FOLIAGE_FAR]))
  })
  it('haystacks differ in footprint from seed to seed and stay light', () => {
    const w = (seed: number) => { const b = new THREE.Box3().setFromObject(KIT.haystack(seed, 1.4)); return [b.max.x - b.min.x, b.max.z - b.min.z] }
    expect(w(1)).not.toEqual(w(2))
    expect(Math.abs(w(1)[0] - w(1)[1])).toBeGreaterThan(0.02) // not a body of revolution
    expect(tris(KIT.haystack(1, 1.4))).toBeLessThan(1000)
  })
})
