/**
 * A procedural clay dragon (ported from the E114 spike's dragon.js, 2026-10-24) with a standing ROAR: it starts low on all fours, rears
 * up onto its hind legs over ~2 s, throws its head back at the sky with the jaw open and the wings half spread, holds the roar with a
 * shake, and settles a little. ~18 m nose to tail; the rearing head stands ~12 m up. Smooth swept body, membrane wings on arm and
 * finger bones, capsule legs. pose(t) is pure in t. Local +x = forward (its facing), +y = up; the creature's root sits on the ground.
 */
import * as THREE from 'three'
import { shared } from '../dispose.ts'

const CLAY = shared(new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.75, metalness: 0 }))
const WING = shared(new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }))
const RINGS = 160, SIDES = 18
const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0)
const sm = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b)
const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z)

/** body radius along s (0 = tail tip, 1 = snout) */
function radius(s: number): number {
  const tail = sm(0, 0.42, s) * 1.25, neck = 1 - 0.55 * sm(0.6, 0.72, s)
  const head = 1 + 0.35 * Math.exp(-((s - 0.93) ** 2) / 0.0006), snout = 1 - sm(0.95, 1, s) * 0.8
  return Math.max(0.06, (0.08 + tail * neck * head * snout) * 1.6)
}

// spine control points (tail tip → snout): crouched on all fours, and reared up roaring at the sky
const LOW = [V(-11, 0.4), V(-8.5, 0.6), V(-6, 1.0), V(-3.5, 1.8), V(-1, 2.4), V(1.5, 2.6), V(3.5, 2.4), V(5.2, 2.4), V(6.6, 2.6), V(7.6, 2.4), V(8.4, 2.1)]
const REAR = [V(-11, 0.4), V(-8.5, 0.5), V(-6, 0.8), V(-3.6, 1.6), V(-1.6, 3.2), V(-0.2, 5.4), V(0.6, 7.6), V(1.0, 9.4), V(1.2, 11.0), V(2.1, 12.2), V(3.4, 12.9)]

/** how reared up it is at time t: crouched, rising 0.5–2.5 s, full roar to ~6 s, settling slightly after */
const rearAt = (t: number) => sm(0.5, 2.5, t) - 0.15 * sm(6, 7.5, t)
/** the jaw: opens as it rears, wide through the roar */
const jawAt = (t: number) => sm(1.8, 2.8, t) * (1 - 0.6 * sm(6, 7.5, t))

function spine(t: number): THREE.CatmullRomCurve3 {
  const r = rearAt(t), shake = Math.sin(t * 9) * 0.25 * sm(2.6, 3.2, t) * (1 - sm(5.5, 6.5, t))
  const pts = LOW.map((p, i) => {
    const q = p.clone().lerp(REAR[i], r), s = i / (LOW.length - 1)
    q.z += Math.sin(t * 1.4 - s * 4) * (1 - s) * 0.9 // tail sway
    if (s > 0.75) q.z += shake * (s - 0.75) * 4 // the head shakes through the roar
    q.y += Math.sin(t * 2.1) * 0.08 * s // breathing
    return q
  })
  return new THREE.CatmullRomCurve3(pts)
}

function buildBody(): THREE.Mesh {
  const geo = new THREE.BufferGeometry(), idx: number[] = []
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SIDES; j++) { const a = i * (SIDES + 1) + j, b = a + SIDES + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RINGS + 1) * (SIDES + 1) * 3), 3)); geo.setIndex(idx)
  return new THREE.Mesh(geo, CLAY)
}

function sweep(mesh: THREE.Mesh, curve: THREE.CatmullRomCurve3): void {
  const p = mesh.geometry.attributes.position as THREE.BufferAttribute, c = new THREE.Vector3(), tg = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3()
  for (let i = 0; i <= RINGS; i++) {
    const s = i / RINGS; curve.getPointAt(s, c); curve.getTangentAt(s, tg)
    b.crossVectors(tg, Math.abs(tg.y) > 0.95 ? X : UP).normalize(); n.crossVectors(b, tg).normalize()
    const r = radius(s), belly = s > 0.3 && s < 0.7 ? 1.15 : 1
    for (let j = 0; j <= SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2, k = i * (SIDES + 1) + j, ny = Math.cos(a) * r * belly, nz = Math.sin(a) * r
      p.setXYZ(k, c.x + n.x * ny + b.x * nz, c.y + n.y * ny + b.y * nz, c.z + n.z * ny + b.z * nz)
    }
  }
  p.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere()
}

const aim = (m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) => {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length()
  m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, Math.max(L, 1e-3), 1); m.quaternion.setFromUnitVectors(UP, d.normalize())
}
const limb = (r: number) => new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, 1, 10), CLAY)

type Wing = { arm: THREE.Mesh; fore: THREE.Mesh; fingers: THREE.Mesh[]; mem: THREE.Mesh }
function buildWing(g: THREE.Group): Wing {
  const bone = () => { const m = limb(0.18); g.add(m); return m }
  const mem = new THREE.Mesh(new THREE.BufferGeometry(), WING); mem.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 9), 3)); g.add(mem)
  return { arm: bone(), fore: bone(), fingers: [bone(), bone(), bone(), bone()], mem }
}

/** a wing from the shoulder: `spread` 0 = folded along the body, 1 = fully open; `lift` raises it */
function poseWing(w: Wing, sh: THREE.Vector3, side: number, spread: number, lift: number, hip: THREE.Vector3): void {
  const el = sh.clone().add(V(-1.6 + spread * 0.6, 1.2 + lift * 2.4, (1.2 + spread * 2.8) * side))
  const wr = el.clone().add(V(-0.6 + spread * 1.4, 0.8 + lift * 2, (1 + spread * 3.2) * side))
  aim(w.arm, sh, el); aim(w.fore, el, wr)
  const tips = [[2.2, 2.6], [-0.4, 4.6], [-3.2, 4.2], [-5.4, 2.8]].map(([fx, fz]) => wr.clone().add(V(fx * (0.4 + spread * 0.6), lift * 1.2 - 0.8, fz * side * (0.35 + spread * 0.65))))
  tips.forEach((tp, k) => aim(w.fingers[k], wr, tp))
  const tris = [[sh, wr, tips[0]], [wr, tips[0], tips[1]], [wr, tips[1], tips[2]], [wr, tips[2], tips[3]], [sh, wr, tips[3]], [sh, tips[3], hip]]
  const a = w.mem.geometry.attributes.position as THREE.BufferAttribute
  tris.forEach((tr, i) => tr.forEach((v, j) => a.setXYZ(i * 3 + j, v.x, v.y, v.z)))
  a.needsUpdate = true; w.mem.geometry.computeVertexNormals(); w.mem.geometry.computeBoundingSphere()
}

export interface Creature { readonly object: THREE.Object3D; pose(t: number): void; dispose(): void }

/** a standing, roaring dragon at ground point `at` (x, z), facing yawDeg (0 = +z, as the performer), `scale` 1 = ~18 m long */
export function createDragon(o: { at: [number, number]; yawDeg?: number; scale?: number; groundAt?: (x: number, z: number) => number }): Creature {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body)
  const trunk = buildBody(); body.add(trunk)
  const wings = [buildWing(body), buildWing(body)]
  const legs = Array.from({ length: 8 }, () => { const m = limb(0.42); body.add(m); return m }) // 4 legs × upper/lower
  const head = new THREE.Group(); body.add(head)
  for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.8, 8), CLAY); horn.rotation.z = Math.PI * 0.62; horn.position.set(-0.6, 0.6, 0.38 * s); head.add(horn) }
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.1, 10), CLAY); head.add(jaw)
  root.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true })
  const scale = o.scale ?? 1, [x, z] = o.at
  root.position.set(x, o.groundAt ? o.groundAt(x, z) : 0, z); root.scale.setScalar(scale)
  root.rotation.y = ((o.yawDeg ?? 0) * Math.PI) / 180 - Math.PI / 2 // local +x (its forward) onto the yaw (0 = +z)

  function pose(t: number): void {
    const tc = Math.max(0, t), curve = spine(tc); sweep(trunk, curve)
    const hip = curve.getPointAt(0.42), chest = curve.getPointAt(0.6), r = rearAt(tc)
    // hind legs plant under the hips; forelegs stand under the chest when low, claw the air when reared
    let k = 0
    for (const side of [-1, 1]) {
      const knee = hip.clone().add(V(0.9, -hip.y * 0.45, 1.0 * side)), foot = V(hip.x + 0.4, 0.15, hip.z + 1.2 * side)
      aim(legs[k++], hip.clone().add(V(0, 0, 0.8 * side)), knee); aim(legs[k++], knee, foot)
      const fShoulder = chest.clone().add(V(0.3, -0.4, 0.9 * side))
      const fElbow = fShoulder.clone().lerp(fShoulder.clone().add(V(1.2, 0.6, 0.4 * side)), r).add(V(0, -1.2 * (1 - r), 0))
      const fPaw = V(chest.x + 0.8, 0.15, chest.z + 1.1 * side).lerp(fElbow.clone().add(V(1.0, -0.4 + Math.sin(tc * 3 + side) * 0.3, 0)), r)
      aim(legs[k++], fShoulder, fElbow); aim(legs[k++], fElbow, fPaw)
    }
    const spread = 0.35 + 0.55 * sm(2.2, 3.2, tc) * (1 - 0.4 * sm(6, 7.5, tc)), flap = Math.sin(tc * 1.6) * 0.15
    wings.forEach((w, i) => poseWing(w, chest.clone().add(V(-0.4, 0.6, 0.7 * (i ? -1 : 1))), i ? -1 : 1, spread, 0.2 + r * 0.5 + flap, hip))
    const hp = curve.getPointAt(0.965), ht = curve.getTangentAt(0.965).normalize()
    head.position.copy(hp); head.quaternion.setFromUnitVectors(X, ht)
    const open = jawAt(tc) * 0.75 // radians the lower jaw drops
    jaw.position.set(0.9, -0.45 - open * 0.4, 0); jaw.rotation.set(0, 0, -Math.PI / 2 - open)
  }
  function dispose(): void { root.traverse((m) => { const mm = m as THREE.Mesh; if (mm.isMesh) mm.geometry.dispose() }) } // CLAY/WING are shared
  pose(0)
  return { object: root, pose, dispose }
}
