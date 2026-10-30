// S6: extras of every height keep their feet planted while walking, and a scaled figure kneels on the ground, not through it.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../contract.ts'
import { extraSpec, HERO_SPEC } from '../figureSpec.ts'
import { buildFigure } from '../mannequin.ts'
import { compile } from '../motion/compile.ts'
import type { Library } from '../motion/library.ts'
import { evaluator } from '../motion/timeline.ts'
import { performerFrom } from '../performer.ts'
import { KNEEL_END, STRAIGHT, diskLibrary } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const LONG: PerformancePlan = { ...STRAIGHT, path: [[0, 0], [0, -40]] }
// limb capsule order in mannequin.ts LIMBS: 4 and 5 are the left and right foot (foot to toe); the first 14 children are all limbs
const FOOT = [4, 5], at = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())

/** the planted foot's ground speed (m/s) at each step of a steady walk: the lower foot's horizontal travel per step */
function slip(variant: number, gait: 'walk' | 'run' = 'walk'): number[] {
  const p = performerFrom({ ...LONG, extras: [{ path: [[5, 0], [5, -60]], gait, delay: 0, costume: 'modern', variant }] }, () => 0, lib)
  const x = p.object.children.find((c) => c.userData.entity === `extra:0:${variant}`)!
  const dt = 1 / 30, out: number[] = []
  let prev: THREE.Vector3[] | null = null
  for (let t = 3; t < 9; t += dt) {
    p.poseAt(t); x.updateMatrixWorld(true)
    const f = FOOT.map((i) => at(x.children[i]))
    if (prev) { const k = f[0].y < f[1].y ? 0 : 1; out.push(Math.hypot(f[k].x - prev[k].x, f[k].z - prev[k].z) / dt) }
    prev = f
  }
  return out
}
const median = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)]

describe('extras foot slip by height', () => {
  // variant 2 is the hero's height: its figure's own foot-roll sets the floor of the measure (the foot capsule's centre is not the contact
  // point). A height mismatch showed up as ~8% of walking speed (about 11 cm/s) over that floor; scaled strides must add under 3 cm/s.
  const base = () => median(slip(2))
  for (const v of [6, 1, 0, 3]) it(`variant ${v} (height ${extraSpec(v).build.height}) plants its feet like the hero-height figure`, () => {
    expect(median(slip(v)) - base()).toBeLessThan(0.03)
  })
  it('a run keeps them planted too', () => { expect(median(slip(6, 'run')) - median(slip(2, 'run'))).toBeLessThan(0.05) })
})

describe('scaled figures stand on the ground', () => {
  it('a kneeling extra-sized figure has its limbs where the hero-sized figure has them, scaled about the floor', () => {
    const tl = compile(KNEEL_END, lib), ev = evaluator(tl)
    const floor = (f: ReturnType<typeof buildFigure>) => { f.fig.updateMatrixWorld(true); const b = new THREE.Box3(); for (const l of f.fig.children.slice(0, 14)) b.expandByObject(l); return b.min.y }
    const hero = buildFigure(lib.canon, 1.8, HERO_SPEC)
    for (const v of [0, 1, 3, 6]) {
      const s = extraSpec(v).build.height, f = buildFigure(lib.canon, 1.8, extraSpec(v))
      for (let t = 0; t < tl.duration; t += 0.25) {
        hero.apply(ev.pose(t)); const h = floor(hero)
        f.apply(ev.pose(t))
        expect(Math.abs(floor(f) - s * h)).toBeLessThan(0.014) // the pre-fix sink was 1.5-2 cm; the tapered limbs are a little thicker at the thigh, which a build's bulk widens sideways
      }
    }
  })
})
