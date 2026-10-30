/**
 * The props a carrying action brings (2026-10-25, the lift; track D generalises it to a made move's held object): the library lift
 * places a hive where the pick happens; every carrying action's object rests at the grab point until the hands take it, rides the
 * wrist midpoint while held (frameMath.ts), and rests where it was let go. The object is the frame model when the clip's prop kind is
 * 'frame' (clips.ts), else a plain clay block sized to the grip (plan 4: the still and render name the object over the block). A made
 * move names a set piece of its own, so it never builds a hive — no second copy of the piece (plan 4, E146's rule in another form).
 * One carry per action on the timeline. Built from the compiled timeline, so the hive is wherever the action was placed on the path,
 * facing the way the body faces. Both hang under the performer's object and carry `userData.entity` ('prop:hive', 'prop:frame') for
 * the ID pass. Geometry as E146 drew it: a frame of 0.48 m top bar with comb, a hive of two open boxes on a stand (0.51 x 0.41 m).
 */
import * as THREE from 'three'
import type { EntityTag, KitItem } from '../contract.ts'
import { clay } from '../kit.ts'
import type { Timeline } from '../motion/compile.ts'
import { holdsProp } from '../motion/phase.ts'
import { segPose, type Seg } from '../motion/segments.ts'
import { fk, fkBuffers, makePose, type Pose, type Skeleton } from '../motion/skeleton.ts'
import { segIndex } from '../motion/timeline.ts'
import { framePlacement, hiveFromPick } from './frameMath.ts'
import { setHiveAt } from './liftSpots.ts'

export type PropRig = { object: THREE.Group; pose(t: number, world: Pose): void }

let mats: Record<'wood' | 'comb' | 'dark', THREE.MeshStandardMaterial> | null = null
const M = () => (mats ??= { wood: clay(0.6, 0.9), comb: clay(0.55, 0.95), dark: clay(0.42, 0.95) })

function box(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): void {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o)
}

/** the held object: the frame model for a 'frame' prop, else a plain clay block sized to the grip (top centre at the origin, hanging
 *  toward -y like the frame, so frameMath.ts's placement rides the wrists either way); tagged 'prop:frame' like the frame */
export function buildHeld(prop: { kind?: string }, grip: number): THREE.Group {
  if (prop.kind === 'frame') return buildFrame()
  const g = new THREE.Group(), w = Math.min(Math.max(grip, 0.3), 0.55)
  g.name = 'held-block'; g.userData.entity = 'prop:frame' satisfies EntityTag
  box(g, w, 0.2, 0.15, 0, -0.1, 0, M().wood)
  return g
}

/** the frame, top bar centre at the origin, bar along +x, hanging toward -y */
export function buildFrame(): THREE.Group {
  const g = new THREE.Group(), { wood, comb } = M()
  g.name = 'lift-frame'; g.userData.entity = 'prop:frame' satisfies EntityTag
  box(g, 0.483, 0.02, 0.026, 0, -0.01, 0, wood)
  for (const sx of [-1, 1]) box(g, 0.022, 0.232, 0.034, sx * 0.21, -0.116, 0, wood)
  box(g, 0.44, 0.012, 0.02, 0, -0.226, 0, wood)
  box(g, 0.40, 0.196, 0.032, 0, -0.122, 0, comb)
  return g
}

/** the hive: a stand and two open boxes up to `rim`, the frames left inside as a row of top bars; base centre at the origin */
export function buildHive(rim: number, w = 0.51, d = 0.41): THREE.Group {
  const g = new THREE.Group(), { wood, dark } = M(), stand = 0.18, boxH = Math.max(rim - stand, 0.2) / 2, wall = 0.02
  g.name = 'lift-hive'; g.userData.entity = 'prop:hive' satisfies EntityTag
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.05, stand - 0.03, 0.05, sx * (w / 2 - 0.04), (stand - 0.03) / 2, sz * (d / 2 - 0.04), dark)
  box(g, w + 0.04, 0.03, d + 0.04, 0, stand - 0.015, 0, dark)
  for (let b = 0; b < 2; b++) {
    const y0 = stand + b * boxH, yc = y0 + boxH / 2
    for (const s of [-1, 1]) { box(g, w, boxH - 0.004, wall, 0, yc, s * (d / 2 - wall / 2), wood); box(g, wall, boxH - 0.004, d, s * (w / 2 - wall / 2), yc, 0, wood) }
    if (!b) box(g, w - 0.02, 0.02, d - 0.02, 0, y0 + 0.01, 0, dark)
  }
  const top = stand + 2 * boxH
  for (let i = 0; i < 8; i++) { const z = -d / 2 + 0.06 + i * 0.037; if (Math.abs(z) >= 0.03) box(g, w - 0.03, 0.02, 0.025, 0, top - 0.012, z, wood) }
  return g
}

/** the performance time at which a pinned segment's clip reaches file time τ */
const timeAt = (seg: Seg, τ: number) => { const a = seg.tau!(seg.t0), b = seg.tau!(seg.t1); return b === a ? seg.t0 : seg.t0 + ((τ - a) * (seg.t1 - seg.t0)) / (b - a) }

type Lift = { segs: number[]; held: THREE.Group; released: boolean; rest: { position: THREE.Vector3; quaternion: THREE.Quaternion }[] }

/** the props of every carrying action on the timeline, or null when it has none. The library lift builds its hive at the pick unless a
 *  hive of the set (`setKit`) stands there (liftSpots.ts: one hive, the set's); a made move names a set piece of its own, so it never
 *  builds one — no second copy of the piece (plan 4). */
export function liftRig(tl: Timeline, canon: Skeleton, groundAt: (x: number, z: number) => number, setKit: readonly KitItem[] = []): PropRig | null {
  const L = canon.index.LeftHand, R = canon.index.RightHand, n = canon.names.length
  const { pos, rot } = fkBuffers(canon), tmp = makePose(n)
  /** the wrists at a segment's own pose at t (no crossfade), on the ground */
  const wristsAt = (seg: Seg, t: number) => { segPose(seg, t, tmp); tmp.root.y += groundAt(tmp.root.x, tmp.root.z); fk(canon, tmp, pos, rot); return [pos[L].clone(), pos[R].clone()] as const }
  const object = new THREE.Group(), lifts: Lift[] = []
  object.name = 'lift-props'
  tl.segs.forEach((seg, i) => {
    const p = seg.clip?.def.prop
    if (!p || !seg.tau) return
    let lift = lifts[lifts.length - 1]
    // a new carry where the segment plays the grab (a hold on the same clip starts after it and goes on with the same object)
    if (!lift || (p.grab !== undefined && seg.tau(seg.t0) <= p.grab + 1e-9)) {
      const τ = p.grab ?? seg.tau(seg.t0), [l, r] = wristsAt(seg, timeAt(seg, τ))
      if (seg.clip!.id === 'lift') { // the hive at the pick; a made move (gen:<id>) brings none, its piece is the set's
        const hive = hiveFromPick(l, r, groundAt((l.x + r.x) / 2, (l.z + r.z) / 2), seg.bodyYaw(seg.t0))
        if (setHiveAt(setKit, hive.at) < 0) {
          const h = buildHive(hive.rim)
          h.position.set(hive.at[0], groundAt(hive.at[0], hive.at[1]), hive.at[1]); h.rotation.y = hive.yaw
          object.add(h)
        }
      }
      const rest = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
      framePlacement(l, r, rest)
      lift = { segs: [], held: buildHeld(p, l.distanceTo(r)), released: false, rest: [rest] }
      object.add(lift.held); lifts.push(lift)
    }
    lift.segs.push(i)
    if (p.release !== undefined) { // where it is let go is where it stays
      lift.released = true
      const [l, r] = wristsAt(seg, timeAt(seg, p.release)), rest = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
      framePlacement(l, r, rest); lift.rest.push(rest)
    }
  })
  if (!lifts.length) return null
  return {
    object,
    pose(t, world) {
      const at = Math.min(Math.max(t, 0), tl.duration), own = segIndex(tl, at)
      for (const lift of lifts) {
        // held on the carry's own segments between grab and release; with no release it keeps riding the hands the whole take after
        const held = (lift.segs.includes(own) && holdsProp(tl.segs[own], at)) || (!lift.released && own > lift.segs[lift.segs.length - 1])
        if (held) { fk(canon, world, pos, rot); framePlacement(pos[L], pos[R], lift.held); continue }
        const after = own > lift.segs[0] || (own === lift.segs[0] && tl.segs[own].tau!(at) >= (tl.segs[own].clip!.def.prop!.grab ?? -Infinity))
        const rest = after ? lift.rest[lift.rest.length - 1] : lift.rest[0]
        lift.held.position.copy(rest.position); lift.held.quaternion.copy(rest.quaternion)
      }
    },
  }
}
