// Track E1: extras walk their own paths on the hero's clock, and every figure carries its entity tag for the ID pass.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../contract.ts'
import { ENTITY_TAG_RE } from '../contract.ts'
import type { Library } from '../motion/library.ts'
import { entityOf, performerFrom } from '../performer.ts'
import { STRAIGHT, diskLibrary } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const WITH_EXTRAS: PerformancePlan = {
  ...STRAIGHT,
  extras: [
    { path: [[-6, -4], [6, -4]], gait: 'run', delay: 1, costume: 'plain', variant: 2 },
    { path: [[3, -20], [3, -12]], gait: 'walk', delay: 0, costume: 'soldier', variant: 0, tag: 'runners' },
  ],
  creatures: [{ kind: 'dragon', action: 'roar', at: [20, -40] }],
}

/** the centre of a figure's meshes (world xz), from its bounding box */
const centre = (o: THREE.Object3D) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()) }

describe('extras in the performer', () => {
  it('tags the hero, each extra and each creature; untagged meshes inside a figure name it by the nearest tag', () => {
    const p = performerFrom(WITH_EXTRAS, () => 0, lib)
    expect(p.object.userData.entity).toBe('hero')
    const tags = p.object.children.map((c) => c.userData.entity).filter(Boolean)
    expect(tags).toEqual(['creature:dragon', 'extra:0:2', 'extra:1:0'])
    for (const t of ['hero', ...tags]) expect(t).toMatch(ENTITY_TAG_RE)
    const extra = p.object.children.find((c) => c.userData.entity === 'extra:1:0')!
    expect(entityOf(extra.children[0] as never)).toBe('extra:1:0')
    const heroLimb = p.object.children.find((c) => !c.userData.entity)!
    expect(entityOf(heroLimb as never)).toBe('hero')
    expect(entityOf(new THREE.Mesh() as never)).toBeNull()
  })

  it('an extra stands at its start until its delay, then walks its path; the hero keeps his own duration', () => {
    const solo = performerFrom(STRAIGHT, () => 0, lib), p = performerFrom(WITH_EXTRAS, () => 0, lib)
    expect(p.duration).toBe(solo.duration)
    const runner = p.object.children.find((c) => c.userData.entity === 'extra:0:2')!
    p.poseAt(0); const a = centre(runner)
    p.poseAt(0.9); const b = centre(runner)
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.3) // still waiting (idle sway only)
    expect(a.x).toBeCloseTo(-6, 0)
    p.poseAt(3); const c = centre(runner)
    expect(c.x - a.x).toBeGreaterThan(3) // running toward +x
    expect(c.z).toBeCloseTo(-4, 0)
  })

  it('plans without extras build exactly the figure they built before (no extra children)', () => {
    const p = performerFrom(STRAIGHT, () => 0, lib)
    expect(p.object.children.some((c) => typeof c.userData.entity === 'string')).toBe(false)
  })
})
