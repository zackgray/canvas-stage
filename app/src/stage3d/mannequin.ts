// Stage3D figure: one neutral clay mannequin on the canonical CMU skeleton (subject 35), the same for the hero and every extra.
// Limb capsules are re-aimed between joint positions every frame; a smooth chest, hips, a plain head and hands ride on bones.
// Nothing on it reads as gear or clothing in a depth map (no helmet, brim, hair, armour, skirt, coat or gown) and every part is one
// clay: the look comes from the cast card and the scene's words, never from the stand-in.
// No skinning, no mixer: apply(pose) runs forward kinematics on a pose from the motion timeline. All meshes are children of `fig`;
// `fig` itself is never moved here (the stage owns its position and scale).
// A figure's build (figureSpec.ts: height, shoulder, bulk) scales its joints about the spot under its hips, so an extra can be
// taller, broader or slighter than the hero without any shared material or geometry changing; the hero's build is 1, 1, 1.
import * as THREE from 'three'
import { shared } from './dispose.ts'
import { HERO_SPEC, type FigureSpec } from './figureSpec.ts'
import { clay } from './kit.ts'
import { fk, fkBuffers, makePose, type Pose, type Skeleton } from './motion/skeleton.ts'

/** the one clay every part of every figure wears (shared: never mutated, never freed by disposeTree) */
export const FIGURE_CLAY = shared(clay(0.62, 0.9))
const UP = new THREE.Vector3(0, 1, 0)
const mesh = (geo: THREE.BufferGeometry, name: string) => { const m = new THREE.Mesh(geo, FIGURE_CLAY); m.name = name; m.castShadow = m.receiveShadow = true; return m }

/** [from, to, radius at `from` m, radius at `to` m, bulge]: tapered limb segments between joints (bulge = how much the middle swells: a thigh, a calf, a forearm) */
const LIMBS: [string, string, number, number, number][] = [
  ['LeftUpLeg', 'LeftLeg', 0.092, 0.066, 0.1], ['RightUpLeg', 'RightLeg', 0.092, 0.066, 0.1],
  ['LeftLeg', 'LeftFoot', 0.066, 0.043, 0.16], ['RightLeg', 'RightFoot', 0.066, 0.043, 0.16],
  ['LeftFoot', 'LeftToeBase', 0.048, 0.034, 0], ['RightFoot', 'RightToeBase', 0.048, 0.034, 0],
  ['LeftArm', 'LeftForeArm', 0.058, 0.047, 0.1], ['RightArm', 'RightForeArm', 0.058, 0.047, 0.1],
  ['LeftForeArm', 'LeftHand', 0.047, 0.034, 0.12], ['RightForeArm', 'RightHand', 0.047, 0.034, 0.12],
  ['LeftShoulder', 'LeftArm', 0.07, 0.06, 0], ['RightShoulder', 'RightArm', 0.07, 0.06, 0],
  ['Neck', 'Head', 0.058, 0.05, 0], ['LowerBack', 'Spine1', 0.118, 0.132, 0],
]

/** a smooth tapered segment along +y: radius r0 at the bottom (the `from` joint) to r1 at the top, swelling by `bulge` in the middle, rounded at both ends (a lathe, no seam) */
function segmentGeometry(len: number, r0: number, r1: number, bulge: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [], cap = 3, steps = 4
  for (let i = 0; i <= cap; i++) { const a = (i / cap) * (Math.PI / 2); pts.push(new THREE.Vector2(r0 * Math.sin(a), -len / 2 - r0 * Math.cos(a))) }
  for (let i = 1; i < steps; i++) { const t = i / steps; pts.push(new THREE.Vector2((r0 + (r1 - r0) * t) * (1 + bulge * Math.sin(Math.PI * t)), -len / 2 + len * t)) }
  for (let i = 0; i <= cap; i++) { const a = (i / cap) * (Math.PI / 2); pts.push(new THREE.Vector2(r1 * Math.cos(a), len / 2 + r1 * Math.sin(a))) }
  const g = new THREE.LatheGeometry(pts, 12); g.computeVertexNormals()
  return g
}

/** the trunk: an egg that is broad at the shoulders and narrower toward the waist (`top`: how much wider the upper chest is than the lower) */
function torsoGeometry(r: number, top: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 20, 14), p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = y / r
    p.setXYZ(i, x * (1 + top * k), y, z * (1 + 0.06 * k))
  }
  g.computeVertexNormals()
  return g
}

/** the plain head: one smooth egg, narrower toward the chin, with a soft nose bump that says which way it faces (no seam, no jaw piece) */
function headGeometry(): THREE.BufferGeometry {
  const r = 0.1, g = new THREE.SphereGeometry(r, 32, 24), p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), low = Math.max(0, -y / r)
    const nose = z > 0 ? 0.014 * Math.exp(-((x / 0.022) ** 2) - (((y + 0.01) / 0.03) ** 2)) : 0
    p.setXYZ(i, x * 0.88 * (1 - 0.16 * low), y * 1.18, z * (1 - 0.08 * low) + 0.012 * low * Math.max(0, z / r) + nose)
  }
  g.computeVertexNormals()
  return g
}

/** a hand: a flattened mitten from the wrist along the forearm's line (`dir`, in the hand bone's own frame), broadest at the knuckles; no fingers (mocap has one finger joint) */
function handOf(dir: THREE.Vector3): THREE.Group {
  const g = new THREE.Group(), m = mesh(segmentGeometry(0.09, 0.026, 0.02, 0.45), 'hand')
  m.scale.set(1, 1, 0.55); m.quaternion.setFromUnitVectors(UP, dir); m.position.copy(dir).multiplyScalar(0.07); g.add(m)
  return g
}

export type Figure = { fig: THREE.Group; apply(pose: Pose): void; height: number }

/** build the figure for a skeleton; capsule lengths come from the rest pose (bones are rigid, so they never change).
 *  `spec` picks the build (the hero's by default; an extra's comes from extraSpec(variant)). */
export function buildFigure(skel: Skeleton, height = 1.8, spec: FigureSpec = HERO_SPEC): Figure {
  const fig = new THREE.Group(), I = skel.index, { pos, rot } = fkBuffers(skel), { height: s, bulk, shoulder } = spec.build
  fk(skel, makePose(skel.names.length), pos, rot) // rest pose
  const limbs = LIMBS.filter(([a, b]) => I[a] !== undefined && I[b] !== undefined).map(([a, b, r0, r1, bulge]) => {
    const len = pos[I[a]].distanceTo(pos[I[b]]), m = mesh(segmentGeometry(Math.max(0.01, len), r0, r1, bulge), `limb:${a}`)
    m.scale.set(s * bulk, s, s * bulk)
    fig.add(m)
    return { a: I[a], b: I[b], m }
  })
  const chest = mesh(torsoGeometry(0.16, 0.2), 'chest'); chest.scale.set(1.0 * shoulder * bulk, 1.26, 0.74 * bulk)
  const hips = mesh(torsoGeometry(0.13, -0.1), 'hips'); hips.scale.set(1.14 * bulk, 0.8, 0.8 * bulk)
  const head = mesh(headGeometry(), 'head')
  /** the forearm's line in the rest pose, in the hand bone's own frame */
  const along = (hand: string, fore: string) => I[hand] === undefined || I[fore] === undefined ? UP.clone()
    : pos[I[hand]].clone().sub(pos[I[fore]]).normalize().applyQuaternion(rot[I[hand]].clone().invert())
  const pieces: [string, THREE.Object3D, [number, number, number]][] = [
    ['Head', head, [0, 0.07, 0.01]], ['Spine1', chest, [0, -0.1, 0.02]], ['Hips', hips, [0, 0.02, 0]],
    ['LeftHand', handOf(along('LeftHand', 'LeftForeArm')), [0, 0, 0]], ['RightHand', handOf(along('RightHand', 'RightForeArm')), [0, 0, 0]],
  ]
  const parts = pieces.filter(([bone]) => I[bone] !== undefined).map(([bone, piece, off]) => {
    piece.scale.multiplyScalar(s); fig.add(piece); return { j: I[bone], piece, off: new THREE.Vector3(...off).multiplyScalar(s) }
  })
  const d = new THREE.Vector3(), o = new THREE.Vector3(), g = new THREE.Vector3(), hipsAt = I.Hips

  /** pose the figure: root position (world, metres) and local joint rotations */
  function apply(pose: Pose): void {
    fk(skel, pose, pos, rot)
    if (s !== 1) { // scale every joint about the ground point under the hips: the floor of the pose frame (y = 0), so a kneel or a bob does not sink or lift a scaled figure
      g.copy(pos[hipsAt]); g.y = 0
      for (const p of pos) p.sub(g).multiplyScalar(s).add(g)
    }
    for (const L of limbs) {
      const pa = pos[L.a]; d.subVectors(pos[L.b], pa)
      L.m.position.copy(pa).addScaledVector(d, 0.5); L.m.quaternion.setFromUnitVectors(UP, d.normalize())
    }
    for (const P of parts) { const q = rot[P.j]; P.piece.quaternion.copy(q); P.piece.position.copy(pos[P.j]).add(o.copy(P.off).applyQuaternion(q)) }
  }
  return { fig, apply, height: height * s }
}
