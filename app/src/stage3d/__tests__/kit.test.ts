import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { KIT, KIT_ARGS, KIT_PIECES } from '../kit.ts'
import { parsePlan } from '../plan.ts'
import { BATTLEFIELD } from '../presets.ts'

function measure(o: THREE.Object3D) {
  let verts = 0, nan = 0
  o.traverse((c) => {
    const g = (c as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
    if (!g) return
    verts += g.attributes.position.count
    for (const v of g.attributes.position.array) if (!Number.isFinite(v)) nan++
  })
  const b = new THREE.Box3().setFromObject(o)
  return { verts, nan, box: [...b.min.toArray(), ...b.max.toArray()] }
}

/** argument sets to build with: defaults, other seeds, and every arg at its minimum and maximum */
function argSets(kind: string): number[][] {
  const spec = KIT_ARGS[kind], seedAt = spec.findIndex((s) => s.name === 'seed')
  const sets: number[][] = [[], spec.map((s) => s.min), spec.map((s) => s.max)]
  for (const seed of [7, 4242]) sets.push(spec.map((s, i) => (i === seedAt ? seed : s.def)))
  return sets
}

describe('kit builders', () => {
  it('has the 9 original pieces and the battlefield growth', () => {
    for (const k of ['fence', 'spear', 'palisade', 'cart', 'tent', 'rock', 'banner', 'fire', 'debris', 'deadTree', 'tree', 'hut', 'barricade', 'haystack', 'barrels', 'crates', 'campfireRing', 'weaponRack', 'wagon', 'mound', 'treeline'])
      expect(KIT[k], k).toBeTypeOf('function')
    expect(Object.keys(KIT).sort()).toEqual(Object.keys(KIT_PIECES).sort())
  })
  for (const kind of Object.keys(KIT_PIECES)) {
    it(`${kind}: deterministic, finite, on the ground, no NaN`, () => {
      for (const args of argSets(kind)) {
        const a = measure(KIT[kind](...args)), b = measure(KIT[kind](...args))
        expect(b.verts, `${kind}(${args}) vertex count`).toBe(a.verts)
        expect(b.box, `${kind}(${args}) bounding box`).toEqual(a.box)
        expect(a.verts).toBeGreaterThan(0)
        expect(a.nan).toBe(0)
        expect(a.box.every(Number.isFinite)).toBe(true)
        // rocks and bare flames are sunk by design (half-buried boulder, flame cones centred above the ground): bounded by their size instead
        const size = kind === 'rock' || kind === 'fire' ? (args[1] ?? KIT_ARGS[kind][1].def) : 0
        expect(a.box[1], `${kind}(${args}) lowest point`).toBeGreaterThanOrEqual(Math.min(-0.5, -0.8 * size))
      }
    })
  }
  it('different seeds give different pieces', () => {
    for (const k of ['tree', 'deadTree', 'hut', 'haystack', 'treeline', 'wagon']) {
      const spec = KIT_ARGS[k], si = spec.findIndex((s) => s.name === 'seed')
      const mk = (seed: number) => measure(KIT[k](...spec.map((s, i) => (i === si ? seed : s.def))))
      expect(JSON.stringify(mk(1).box) + mk(1).verts).not.toBe(JSON.stringify(mk(99).box) + mk(99).verts)
    }
  })
  it('tree: a foliage crown (not the bare deadTree), bounded size, crown follows crownWidth', () => {
    const t = measure(KIT.tree(1, 6, 4)), d = measure(KIT.deadTree(1, 6))
    expect(t.verts, 'tree triangle budget').toBeLessThan(12000)
    expect(t.verts, 'foliage adds mass over bare branches').toBeGreaterThan(d.verts)
    const width = (m: ReturnType<typeof measure>) => m.box[3] - m.box[0]
    expect(width(t)).toBeGreaterThan(3)
    expect(width(measure(KIT.tree(1, 6, 8)))).toBeGreaterThan(width(measure(KIT.tree(1, 6, 2))) + 3)
    const mats = new Set<THREE.Material>()
    KIT.tree(1, 6, 4).traverse((c) => { if ((c as THREE.Mesh).isMesh) mats.add((c as THREE.Mesh).material as THREE.Material) })
    expect(mats.size, 'bark and foliage are separate materials').toBe(2)
  })
  it('plan validation accepts tree with args in range and rejects out of range', () => {
    const base = () => JSON.parse(JSON.stringify(BATTLEFIELD))
    const errs = (args: number[]) => { const r = parsePlan({ ...base(), kit: [{ kind: 'tree', at: [10, -20], args }] }); return r.ok ? '' : r.errors.join(' | ') }
    expect(errs([5, 6, 4])).toBe('')
    expect(errs([5, 12, 9])).toBe('')
    expect(errs([5, 20, 4])).toMatch(/height/)
    expect(errs([5, 6, 0.5])).toMatch(/crownWidth/)
  })
})
