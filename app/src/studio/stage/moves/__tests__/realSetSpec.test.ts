// The move spec from a real set (QA run 5, the baker): the panel measures a Set piece placed off to the side and turned, and the
// keys must land in front of her at arm's reach in performer-local coordinates (Y up, her at the origin facing +Z, her left =
// +X). Two sign slips hid behind straight-ahead test pieces: the world -> performer turn (a piece off to her side read as at
// her hips) and the piece's own turn (a turned piece's footprint mirrored). Built through the panel's own path: pieceWorldBox
// and reachPieces, then planMove exactly as DescribeMovePanel calls it.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { KitItem } from '../../../../stage3d/contract'
import { pieceOf } from '../../../../stage3d/kit'
import { planMove, WORK_FRONT_MAX, WORK_RIM_MAX, UNKNOWN_GRIP_MAX, type MoveSpec, type Vec3 } from '../../../../stage3d/moves/index.ts'
import { pieceWorldBox, reachPieces } from '../pieces'

/** a 0.6 m generated cube (a glb piece's unit box), so the expected numbers are exact */
const cube = (at: [number, number], yawDeg = 0): KitItem => ({ kind: 'crates', at, yawDeg, label: 'oven', glb: { url: 'x.glb', unitScale: 0.6 } })

const specFor = (kit: KitItem[], point: [number, number], words = 'slides a tray of loaves out of the oven and holds it up'): MoveSpec => {
  const piece = reachPieces(kit, point).find((p) => p.name === 'oven' || p.name.includes('glow'))
  if (!piece) throw new Error('piece not listed')
  const r = planMove({ words, piece: { id: piece.id, name: piece.name, box: piece.box }, at: [point[0], 0, point[1]] })
  if (r.kind !== 'spec') throw new Error(`expected a spec, got ${JSON.stringify(r)}`)
  return r.spec
}

const grab = (s: MoveSpec): { L: Vec3; R: Vec3 } => ({ L: s.keys[0].hands.Left, R: s.keys[0].hands.Right })

describe('a piece off to her side, measured in her own frame', () => {
  it('a cube 0.8 m to her right (world -X of the point): its near face reads 0.5 m ahead once she turns to it', () => {
    const point: [number, number] = [2, 3]
    const s = specFor([cube([2 - 0.8, 3])], point)
    expect(s.prop!.front).toBeCloseTo(0.5, 6)
    expect(s.prop!.width).toBeCloseTo(0.6, 6)
    expect(s.prop!.rimOrTop).toBeCloseTo(0.6, 6)
    const { L, R } = grab(s)
    expect(L[2]).toBeCloseTo(0.56, 6) // front + 0.06: in front of her, at the near face
    expect(L[0]).toBeGreaterThan(0) // her left hand on her left (+X)
    expect(R[0]).toBeCloseTo(-L[0], 9)
  })
  it('the same cube on the diagonal: seen turned 45 degrees, its near corner is 1 - 0.3 x sqrt 2 ahead', () => {
    const d = 1 / Math.SQRT2
    const s = specFor([cube([5 + d, -4 + d])], [5, -4])
    expect(s.prop!.front).toBeCloseTo(1 - 0.3 * Math.SQRT2, 6)
    expect(s.prop!.width).toBeCloseTo(0.6 * Math.SQRT2, 6)
  })
  it('a cube turned 45 degrees on the Set and seen on the diagonal is square to her: its face, not an inflated box', () => {
    const d = 1 / Math.SQRT2
    const s = specFor([cube([d, d], 45)], [0, 0])
    expect(s.prop!.front).toBeCloseTo(0.7, 6)
    expect(s.prop!.width).toBeCloseTo(0.6, 6)
  })
})

describe('the piece box follows the world build', () => {
  it('a turned kit piece: the box is the one world.ts builds (position, yaw, scale)', () => {
    const it0: KitItem = { kind: 'crates', args: [3, 3], at: [1.5, -2], yawDeg: 30, scale: 1.4 }
    const piece = pieceOf('crates')!
    const o = piece.build(...piece.args.map((a, j) => it0.args?.[j] ?? a.def))
    o.position.set(1.5, 0, -2); o.rotation.y = (30 * Math.PI) / 180; o.scale.setScalar(1.4); o.updateMatrixWorld(true)
    const truth = new THREE.Box3().setFromObject(o)
    const box = pieceWorldBox(it0)!
    // our box is the turned local box, so it contains the true bounds and is never mirrored away from them
    for (const i of [0, 1, 2] as const) {
      expect(box.min[i]).toBeLessThanOrEqual(truth.min.getComponent(i) + 1e-6)
      expect(box.max[i]).toBeGreaterThanOrEqual(truth.max.getComponent(i) - 1e-6)
    }
    expect(box.corners).toHaveLength(8)
  })
})

describe('the baker set (QA run 5): a raised fire as the oven, the point beside it', () => {
  const kit: KitItem[] = [
    { kind: 'hut', args: [8, 6, 8], at: [-9, -10], yawDeg: 0, label: 'small brick-oven bakery', scale: 2 },
    { kind: 'fire', args: [1, 1], at: [-9, -10], yawDeg: -15, label: 'warm orange oven glow', scale: 1.73, pieceTag: 'prop:oven' },
  ]
  it('every key is in the working band the motion computer can reach, and the grip is not the oven\'s width', () => {
    for (const point of [[-8.3, -10.4], [-9.6, -9.2], [-10.1, -10.6]] as [number, number][]) {
      const s = specFor(kit, point)
      for (const k of s.keys) {
        for (const h of [k.hands.Left, k.hands.Right]) {
          expect(h[2]).toBeGreaterThan(0.15) // in front of her
          expect(h[2]).toBeLessThanOrEqual(WORK_FRONT_MAX + 0.06 + 1e-9) // at arm's reach, not beyond
        }
      }
      expect(s.keys[0].hands.Left[1]).toBeLessThanOrEqual(WORK_RIM_MAX + 0.1 + 1e-9) // the flame's 2.3 m top is not the grab height
      expect(s.keys[0].hands.Left[0] * 2).toBeLessThanOrEqual(UNKNOWN_GRIP_MAX + 1e-9)
    }
  })
  it('the held object is the user\'s tray, not the beekeeper\'s frame', () => {
    const s = specFor(kit, [-8.3, -10.4])
    expect(s.sentence).toContain('lifts out a tray of loaves')
    expect(s.sentence).not.toMatch(/frame/)
    expect(s.phases.map((p) => p.words).join(' ')).toContain('a tray of loaves')
  })
})
