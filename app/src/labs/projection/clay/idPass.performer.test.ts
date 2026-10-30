// Join (E1 x E2): extras and creatures hang under the hero's object, so the ID pass must name each mesh by its nearest tagged
// ancestor. A real performer with extras: no extra or creature mesh may come out hero-red.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../../../stage3d/contract'
import type { Library } from '../../../stage3d/motion/library'
import { performerFrom } from '../../../stage3d/performer'
import { STRAIGHT, diskLibrary } from '../../../stage3d/__tests__/motion.fixture'
import { idColorOf, withIdMaterials } from './idPass'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const PLAN: PerformancePlan = {
  ...STRAIGHT,
  extras: [
    { path: [[-6, -4], [6, -4]], gait: 'run', delay: 0, costume: 'plain', variant: 2 },
    { path: [[3, -20], [3, -12]], gait: 'walk', delay: 0, costume: 'soldier', variant: 3 },
  ],
  creatures: [{ kind: 'dragon', action: 'roar', at: [20, -40] }],
}
const hex = (c: [number, number, number]) => c.map((v) => v.toString(16).padStart(2, '0')).join('')

describe('ID pass on a performer with extras parented under the hero', () => {
  it('colours every mesh by the entity of its own figure', () => {
    const p = performerFrom(PLAN, () => 0, lib)
    const scene = new THREE.Scene(); scene.add(p.object)
    const byFigure: Record<string, Set<string>> = {}
    const table = withIdMaterials(scene, () => {
      for (const fig of [p.object, ...p.object.children]) {
        const tag = fig === p.object ? 'hero' : (fig.userData.entity as string | undefined)
        if (!tag) continue
        const seen = (byFigure[tag] ??= new Set())
        const visit = (o: THREE.Object3D) => {
          if (o !== fig && o.userData.entity) return // a nested figure is its own entity
          const m = o as THREE.Mesh
          if (m.isMesh) seen.add((m.material as THREE.MeshBasicMaterial).color.getHexString())
          o.children.forEach(visit)
        }
        visit(fig)
      }
    })
    expect(Object.keys(table).sort()).toEqual(['creature:dragon', 'extra:0:2', 'extra:1:3', 'hero'])
    for (const tag of ['extra:0:2', 'extra:1:3', 'creature:dragon']) {
      expect(byFigure[tag].size).toBeGreaterThan(0)
      expect([...byFigure[tag]]).toEqual([hex(idColorOf(tag)!)])
      expect(byFigure[tag].has('ff0000')).toBe(false)
    }
    expect([...byFigure.hero]).toEqual(['ff0000'])
  })
})
