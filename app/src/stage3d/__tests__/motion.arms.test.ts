// Recipe wave C3d: the source walk (CMU 35_01) carries its arms almost still (E142: "hanging arms"). Gait clips scale the upper arms'
// swing about their mean carriage: the walk's forward/back swing is >= 20 degrees (was ~13), the run's >= 40 (was ~30), idle untouched.
import { beforeAll, describe, expect, it } from 'vitest'
import { fk, fkBuffers, makePose } from '../motion/skeleton.ts'
import type { Library } from '../motion/library.ts'
import { diskLibrary } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

/** range (degrees) of one upper arm's forward/back swing over a clip's cycle */
function swingRange(id: 'walk' | 'run' | 'idle', side: 'Left' | 'Right'): number {
  const c = lib.canon, { pos, rot } = fkBuffers(c), p = makePose(c.names.length), clip = lib.clips[id], a: number[] = []
  for (let u = 0; u < clip.cycle; u += 0.02) {
    clip.loop(u, p); p.root.set(0, 0, 0); p.q[0].identity(); fk(c, p, pos, rot)
    const v = pos[c.index[side + 'ForeArm']].clone().sub(pos[c.index[side + 'Arm']]).normalize()
    a.push((Math.atan2(v.z, -v.y) * 180) / Math.PI)
  }
  return Math.max(...a) - Math.min(...a)
}

describe('gait arm swing', () => {
  it('the walk swings both arms at least 20 degrees and the run at least 40', () => {
    for (const side of ['Left', 'Right'] as const) {
      expect(swingRange('walk', side)).toBeGreaterThan(20)
      expect(swingRange('run', side)).toBeGreaterThan(40)
    }
  })
  it('idle is as captured, and the loop is pure in u and seamless at the wrap', () => {
    expect(swingRange('idle', 'Left')).toBeLessThan(2)
    const clip = lib.clips.walk, a = makePose(lib.canon.names.length), b = makePose(lib.canon.names.length)
    clip.loop(0.4, a); clip.loop(7.7, b); clip.loop(0.4, b)
    expect(b.q.every((q, i) => 1 - Math.abs(q.dot(a.q[i])) < 1e-12)).toBe(true)
    clip.loop(0, a); clip.loop(clip.cycle, b)
    expect(b.q.every((q, i) => 1 - Math.abs(q.dot(a.q[i])) < 1e-6)).toBe(true)
  })
})
