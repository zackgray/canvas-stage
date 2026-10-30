// Structures family: tent (from the spike), ruined hut, cheval-de-frise barricade, weapon rack, wagon wreck, earth mound. All closed solids.
import * as THREE from 'three'
import { A, SEED, WOOD, WOOD_DARK, STEEL, CLOTH, STONE, EARTH, V, clay, log, rng, slab, around, type Piece } from './common.ts'

/** wrap an object so its lowest point sits `sink` m below y = 0 (kit pieces are placed by their origin) */
function grounded(inner: THREE.Object3D, sink = 0.04): THREE.Group {
  const out = new THREE.Group(); out.add(inner);
  inner.updateMatrixWorld(true);
  inner.position.y -= new THREE.Box3().setFromObject(inner).min.y + sink;
  return out;
}
const tip = (at: THREE.Vector3, dir: THREE.Vector3, r: number, len: number): THREE.Mesh => {
  const c = new THREE.Mesh(new THREE.ConeGeometry(r, len, 5), STEEL), d = dir.clone().normalize();
  c.position.copy(at).addScaledVector(d, len / 2); c.quaternion.setFromUnitVectors(V(0, 1, 0), d); return c;
}

/** a ridge tent: canvas over a pole */
export function tent(seed = 1): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), w = 2.6, l = 3.4, h = 2.1;
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(0, h), new THREE.Vector2(w / 2, 0)]);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: l, bevelEnabled: false }), CLOTH);
  body.position.z = -l / 2; g.add(body);
  g.add(log(V(0, 0, -l / 2 - 0.3), V(0, h + 0.3, -l / 2 - 0.3), 0.04)); g.add(log(V(0, 0, l / 2 + 0.3), V(0, h + 0.3, l / 2 + 0.3), 0.04));
  g.rotation.z = (r() - 0.5) * 0.06;
  return g;
}

/** a ruined hut: four broken stone-and-timber walls with a door gap in the +z wall, collapsed roof beams, rubble inside */
export function hut(seed = 1, width = 5, depth = 4): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), t = 0.38, hw = width / 2, hd = depth / 2, wall = clay(0.5);
  const run = (x0: number, z0: number, x1: number, z1: number, gap = false) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0), dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    const doorAt = gap ? len * (0.3 + r() * 0.3) : -1;
    for (let s = 0; s < len;) {
      const seg = Math.min(len - s, 0.9 + r() * 0.9), mid = s + seg / 2;
      if (gap && Math.abs(mid - doorAt) < 0.75) { s += seg; continue; }
      const h = r() < 0.35 ? 0.4 + r() * 0.7 : 1.5 + r() * 1.1, m = slab(seg, h, t, 0, 0, wall, -0.1);
      m.position.set(x0 + dx * mid, m.position.y, z0 + dz * mid); m.rotation.y = ang; g.add(m); s += seg;
    }
  };
  run(-hw, -hd, hw, -hd); run(hw, -hd, hw, hd); run(hw, hd, -hw, hd, true); run(-hw, hd, -hw, -hd);
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const) if (r() < 0.8) g.add(log(V(x, -0.2, z), V(x, 2.2 + r() * 0.9, z), 0.12, WOOD_DARK));
  const top = 2.5 + r() * 0.3; // collapsed roof: rafters falling from the back wall to the floor, one cross beam still up
  for (let k = 0; k < 4; k++) {
    const x = -hw + 0.5 + (k / 3) * (width - 1), a = V(x, top, -hd), b = V(x + (r() - 0.5) * 0.8, 0.12 + r() * 0.2, -hd + depth * (0.35 + r() * 0.4));
    g.add(log(a, b, 0.09, WOOD));
  }
  g.add(log(V(-hw - 0.1, top, -hd), V(hw + 0.1, top - 0.1, -hd), 0.11, WOOD_DARK));
  for (let k = 0; k < 5; k++) { const s = 0.2 + r() * 0.4, m = slab(s, s * 0.7, s, (r() - 0.5) * (width - 1), (r() - 0.5) * (depth - 1), STONE, 0); m.rotation.y = r() * 3; g.add(m); }
  return g;
}

/** cheval-de-frise: a long beam on crossed pointed stakes, along +x */
export function barricade(length = 6, seed = 1, height = 1.2): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), beamY = height * 0.7, n = Math.max(1, Math.round(length / 1.3));
  g.add(log(V(0, beamY, 0), V(length, beamY, 0), 0.1, WOOD_DARK, 1));
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * length, a = 0.7 + r() * 0.35 + (i % 2) * 0.25;
    for (const s of [1, -1]) {
      const d = V((r() - 0.5) * 0.15, Math.sin(a), s * Math.cos(a)).normalize(), half = Math.min(1.0, (beamY - 0.03) / Math.max(0.05, d.y));
      g.add(log(V(x, beamY, 0).addScaledVector(d, -half), V(x, beamY, 0).addScaledVector(d, 1.0), 0.05, WOOD, 1));
      g.add(tip(V(x, beamY, 0).addScaledVector(d, 1.0), d, 0.05, 0.22));
    }
  }
  return g;
}

/** a weapon rack: two posts, a crossbar and spears leaning on it */
export function weaponRack(seed = 1, count = 5): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), w = 0.35 * count + 0.5;
  for (const x of [-w / 2, w / 2]) { g.add(log(V(x, -0.2, 0), V(x, 1.5, 0), 0.07, WOOD_DARK)); g.add(log(V(x, -0.1, -0.7), V(x, 1.4, 0), 0.05, WOOD_DARK)); }
  g.add(log(V(-w / 2, 1.0, 0.02), V(w / 2, 1.0, 0.02), 0.05)); g.add(log(V(-w / 2, 0.35, 0.02), V(w / 2, 0.35, 0.02), 0.05));
  for (let k = 0; k < count; k++) {
    const x = -w / 2 + 0.4 + (k / Math.max(1, count - 1)) * (w - 0.8), b = V(x, 0, 0.55 + r() * 0.15), top = V(x + (r() - 0.5) * 0.15, 2.0 + r() * 0.5, 0.1);
    g.add(log(b, top, 0.025, WOOD)); g.add(tip(top, top.clone().sub(b), 0.035, 0.28));
  }
  return g;
}

/** a wrecked wagon: tilted bed, two upright wheels, one wheel flat on the ground, broken hoops and a dropped tongue */
export function wagon(seed = 1): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), ring = (R: number) => new THREE.Mesh(new THREE.TorusGeometry(R, 0.07, 6, 20), WOOD_DARK);
  const bed = slab(3.4, 0.14, 1.5, 0, 0, WOOD, 0.7); g.add(bed);
  for (const z of [-0.75, 0.75]) g.add(slab(3.4, 0.5, 0.07, 0, z, WOOD, 0.8));
  g.add(slab(0.07, 0.5, 1.5, -1.7, 0, WOOD, 0.8)); g.add(slab(0.07, 0.35, 1.5, 1.7, 0, WOOD, 0.8));
  g.add(log(V(-1.0, 0.7, 0), V(1.0, 0.7, 0), 0.07, WOOD_DARK)); // axle
  for (const z of [-0.9, 0.9]) { const w = ring(0.7); w.position.set(-1.0, 0.7, z); g.add(w); for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; g.add(log(V(-1 + Math.cos(a) * 0.68, 0.7 + Math.sin(a) * 0.68, z), V(-1 - Math.cos(a) * 0.68, 0.7 - Math.sin(a) * 0.68, z), 0.03)); } }
  const flat = ring(0.7); flat.rotation.x = Math.PI / 2; flat.position.set(1.8 + r() * 0.5, 0.12, 1.6); g.add(flat);
  for (let k = 0; k < 3; k++) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.04, 5, 12, Math.PI), WOOD); h.rotation.y = Math.PI / 2; h.position.set(-1.1 + k * 1.0, 0.82, 0); if (k === 2) { h.rotation.x = 0.9; h.position.y = 1.0; } g.add(h); }
  g.add(log(V(1.7, 0.75, 0.1), V(4.3, 0.1, 0.6 + r() * 0.4), 0.07, WOOD_DARK));
  g.rotation.z = 0.12 + r() * 0.08; g.rotation.y = 0;
  return grounded(g, 0.05);
}

/** a low earth mound / trench lip along +x, lumpy, centred on the placement point */
export function mound(length = 10, seed = 1, height = 0.8): THREE.Mesh {
  const r = rng(seed), hw = height * 1.9, pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 12; k++) { const u = -1 + (2 * k) / 12; pts.push(new THREE.Vector2(u * hw, -0.3 + (height + 0.3) * Math.pow(Math.max(0, 1 - u * u), 0.8))); }
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: length, bevelEnabled: false, steps: Math.max(2, Math.ceil(length / 1.2)) });
  geo.rotateY(Math.PI / 2); geo.translate(-length / 2, 0, 0);
  const p = geo.attributes.position, ph = [r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > -0.2) p.setY(i, y * (1 + 0.28 * Math.sin(p.getX(i) * 0.8 + ph[0]) + 0.15 * Math.sin(p.getX(i) * 2.3 + ph[1]))); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, EARTH); m.castShadow = m.receiveShadow = true; m.userData.snap = true; return m;
}

export const STRUCTURE_PIECES: Record<string, Piece> = {
  tent: { build: tent, args: [SEED], extent: around(2.4), doc: 'ridge tent, 2.6 m wide 3.4 m long, long side along z' },
  hut: { build: hut, args: [SEED, A('width', 3, 8, 5), A('depth', 3, 8, 4)], extent: (a) => { const r = Math.hypot(a[1] ?? 5, a[2] ?? 4) / 2 + 0.3; return [0, 0, r] }, doc: 'ruined hut: broken stone walls, doorway in the +z wall (faces the camera at yaw 0), fallen roof beams, rubble' },
  barricade: { build: barricade, args: [A('length', 2, 16, 6), SEED, A('height', 0.8, 1.8, 1.2)], extent: (a) => [0, a[0] ?? 6, 1.1], doc: 'cheval-de-frise: a long beam on crossed pointed stakes along +x' },
  weaponRack: { build: weaponRack, args: [SEED, A('count', 2, 8, 5, true)], extent: (a) => { const r = (0.35 * (a[1] ?? 5) + 0.5) / 2 + 0.3; return [-r, r, 0.9] }, doc: 'wooden rack with spears leaning on a crossbar, spears lean toward +z' },
  wagon: { build: wagon, args: [SEED], extent: around(2.6), doc: 'wrecked wagon: tilted bed, wheels (one flat on the ground), broken hoops, dropped tongue' },
  mound: { build: mound, args: [A('length', 2, 60, 10), SEED, A('height', 0.3, 1.6, 0.8)], extent: (a) => [-(a[0] ?? 10) / 2, (a[0] ?? 10) / 2, (a[2] ?? 0.8) * 1.9], doc: 'long low earth bank / trench lip along +x, centred on the placement point' },
}
