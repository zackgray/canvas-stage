// One neutral figure: the hero and every extra are the same plain clay mannequin (limbs, a smooth chest and hips, a plain head,
// hands); nothing on it reads as gear or clothing, a saved costume changes nothing, and extras differ only in build.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ExtraPlan, PerformancePlan } from '../contract.ts'
import { disposeTree, isShared } from '../dispose.ts'
import { extraSpec, HERO_SPEC } from '../figureSpec.ts'
import { buildFigure, FIGURE_CLAY } from '../mannequin.ts'
import type { Library } from '../motion/library.ts'
import { makePose } from '../motion/skeleton.ts'
import { entityOf, performerFrom } from '../performer.ts'
import { STRAIGHT, diskLibrary } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse((m) => { if ((m as THREE.Mesh).isMesh) out.push(m as THREE.Mesh) }); return out }
const tris = (o: THREE.Object3D) => meshes(o).reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0)
const rest = (f: ReturnType<typeof buildFigure>) => { f.apply(makePose(lib.canon.names.length)); f.fig.updateMatrixWorld(true); return f.fig }
/** the figure's widest front-back reach between two heights (a brim at the head, a skirt or coat at the shins) */
function reach(o: THREE.Object3D, y0: number, y1: number): number {
  const v = new THREE.Vector3(); let m = 0
  for (const me of meshes(o)) { const p = me.geometry.attributes.position
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(me.matrixWorld); if (v.y > y0 && v.y < y1) m = Math.max(m, Math.abs(v.z)) } }
  return m
}
/** the parts by name, sorted: the build's whole inventory */
const parts = (o: THREE.Object3D) => meshes(o).map((m) => m.name).sort()
const LIMB_NAMES = ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm',
  'LeftShoulder', 'RightShoulder', 'Neck', 'LowerBack'].map((b) => `limb:${b}`)
const NEUTRAL = [...LIMB_NAMES, 'chest', 'hips', 'head', 'hand', 'hand'].sort()

describe('the neutral figure', () => {
  it('the hero and an extra are built of the same parts: limbs, chest, hips, one plain head, two hands; nothing else', () => {
    for (const f of [buildFigure(lib.canon), buildFigure(lib.canon, 1.8, extraSpec(4))]) {
      expect(parts(rest(f))).toEqual(NEUTRAL)
      for (const m of meshes(f.fig)) expect(m.material).toBe(FIGURE_CLAY) // one clay: no steel forearms, no leather boots
    }
  })

  it('has no brim at the head and nothing hanging at the shins', () => {
    const f = rest(buildFigure(lib.canon))
    expect(reach(f, 0.45, 0.8)).toBeLessThan(0.15) // a hat or helmet brim reached 0.21 to 0.25 m
    expect(reach(f, -0.9, -0.5)).toBeLessThan(0.18) // legs only: a coat reached past 0.2 m, a gown past 0.3 m
    expect(new THREE.Box3().setFromObject(f).max.y).toBeLessThan(0.66) // the bare head is the top: no helmet dome, no hair cap
  })

  it('an old performance naming a costume, and old extras in plain and soldier, build exactly the costume-free figures', () => {
    const extras: ExtraPlan[] = [
      { path: [[-6, -4], [6, -4]], gait: 'run', delay: 0, costume: 'plain', variant: 1 },
      { path: [[3, -20], [3, -12]], gait: 'walk', delay: 0, costume: 'soldier', variant: 4 },
    ]
    const old: PerformancePlan = { ...STRAIGHT, costume: 'soldier', extras }
    const now: PerformancePlan = { ...STRAIGHT, extras: extras.map((e) => ({ ...e, costume: 'modern' as const })) }
    const a = performerFrom(old, () => 0, lib), b = performerFrom(now, () => 0, lib)
    a.poseAt(1.3); b.poseAt(1.3)
    const shape = (p: typeof a) => meshes(p.object).map((m) => [m.name, ...m.getWorldPosition(new THREE.Vector3()).toArray().map((n) => +n.toFixed(5))])
    expect(shape(a)).toEqual(shape(b))
    expect(meshes(a.object)).toHaveLength(NEUTRAL.length * 3)
    for (const tag of ['extra:0:1', 'extra:1:4']) expect(parts(a.object.children.find((c) => c.userData.entity === tag)!)).toEqual(NEUTRAL)
  })
})

describe('extras builds', () => {
  it('are a pure function of the variant index', () => {
    for (const v of [0, 3, 7, 12]) expect(extraSpec(v)).toEqual(extraSpec(v))
  })

  it('differ across the eight sheet variants in height, shoulder and bulk', () => {
    const specs = Array.from({ length: 8 }, (_, v) => extraSpec(v))
    expect(new Set(specs.map((s) => JSON.stringify(s.build))).size).toBe(8)
    for (const k of ['height', 'shoulder', 'bulk'] as const) { const xs = specs.map((s) => s.build[k]); expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.1) }
    expect(extraSpec(9).build).not.toEqual(extraSpec(1).build) // past the sheet: the row again, jittered
  })

  it('build measurably different figures that stay modest in triangles', () => {
    const heights = [0, 1, 4].map((v) => { const b = new THREE.Box3().setFromObject(rest(buildFigure(lib.canon, 1.8, extraSpec(v)))); return b.max.y - b.min.y })
    expect(new Set(heights.map((h) => h.toFixed(2))).size).toBe(3)
    expect(tris(buildFigure(lib.canon, 1.8, extraSpec(0)).fig)).toBeLessThan(9000)
  })

  it('the hero wears the hero build when none is given', () => {
    const a = new THREE.Box3().setFromObject(rest(buildFigure(lib.canon))), b = new THREE.Box3().setFromObject(rest(buildFigure(lib.canon, 1.8, HERO_SPEC)))
    expect(a.equals(b)).toBe(true)
  })
})

describe('the shared clay', () => {
  it('is never mutated by building, posing or disposing figures, and no figure owns a material of its own', () => {
    const snap = () => [FIGURE_CLAY.uuid, FIGURE_CLAY.side, FIGURE_CLAY.color.getHex(), FIGURE_CLAY.roughness, FIGURE_CLAY.metalness, FIGURE_CLAY.version].join()
    const before = snap()
    const figs = Array.from({ length: 8 }, (_, v) => buildFigure(lib.canon, 1.8, extraSpec(v)))
    for (const f of figs) { rest(f); for (const m of meshes(f.fig)) expect(isShared(m.material as THREE.Material)).toBe(true) }
    for (const f of figs) disposeTree(f.fig)
    expect(snap()).toBe(before)
  })
})

describe('extras in a performance', () => {
  it('keep their entity tags; the same plan rebuilds the same crowd', () => {
    const plan = { ...STRAIGHT, extras: [
      { path: [[-6, -4], [6, -4]] as [number, number][], gait: 'run' as const, delay: 0, costume: 'modern' as const, variant: 4 },
      { path: [[3, -20], [3, -12]] as [number, number][], gait: 'walk' as const, delay: 0, costume: 'modern' as const, variant: 1 },
    ] }
    const a = performerFrom(plan, () => 0, lib), b = performerFrom(plan, () => 0, lib)
    expect(a.object.children.map((c) => c.userData.entity).filter(Boolean)).toEqual(['extra:0:4', 'extra:1:1'])
    for (const m of meshes(a.object.children.find((c) => c.userData.entity === 'extra:0:4')!)) expect(entityOf(m)).toBe('extra:0:4')
    a.poseAt(1.3); b.poseAt(1.3)
    const pos = (p: typeof a) => meshes(p.object).map((m) => m.getWorldPosition(new THREE.Vector3()).toArray().map((n) => +n.toFixed(5)))
    expect(pos(a)).toEqual(pos(b))
  })
})
