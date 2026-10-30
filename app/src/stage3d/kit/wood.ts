// Wood family: fences, spears, palisade, cart, banner, debris. Ported unchanged from the E114 spike.
import * as THREE from 'three'
import { A, SEED, WOOD, WOOD_DARK, STEEL, V, clay, log, rng, around, type Piece } from './common.ts'

/** split-rail fence along +x for `length` m: posts every ~2.2 m, two or three rails, some broken or sagging */
export function fence(length: number, seed = 1, broken = 0.3): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), n = Math.max(1, Math.round(length / 2.2));
  const posts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * length, h = 1.15 + r() * 0.25, lean = (r() - 0.5) * 0.18;
    const top = V(x + lean * 0.5, h, (r() - 0.5) * 0.12);
    g.add(log(V(x, -0.2, 0), top, 0.07 + r() * 0.02, WOOD_DARK));
    posts.push(top);
  }
  for (let i = 0; i < n; i++) {
    const rails = r() < 0.5 ? 2 : 3;
    for (let k = 0; k < rails; k++) {
      const y = 0.35 + k * 0.33, a = V(posts[i].x - 0.15, y + (r() - 0.5) * 0.08, 0.06), b = V(posts[i + 1].x + 0.15, y + (r() - 0.5) * 0.08, 0.06);
      if (r() < broken) { b.y = 0.05; b.z += (r() - 0.5) * 0.8; } // one end dropped to the mud
      g.add(log(a, b, 0.045 + r() * 0.015));
    }
  }
  return g;
}

/** a spear or stake stuck in the ground at an angle */
export function spear(seed = 1, len = 2.6): THREE.Group {
  const r = rng(seed), g = new THREE.Group();
  const tilt = 0.15 + r() * 0.45, yaw = r() * Math.PI * 2;
  const top = V(Math.cos(yaw) * Math.sin(tilt) * len, Math.cos(tilt) * len, Math.sin(yaw) * Math.sin(tilt) * len);
  g.add(log(V(0, -0.3, 0), top, 0.025, WOOD));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.28, 4), STEEL);
  head.position.copy(top).addScaledVector(top.clone().normalize(), 0.13);
  head.quaternion.setFromUnitVectors(V(0, 1, 0), top.clone().normalize());
  g.add(head);
  return g;
}

/** a palisade: a row of pointed upright logs along +x */
export function palisade(length: number, seed = 1, height = 3): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), step = 0.32;
  // irregular on purpose (2026-10-24: a row of identical evenly spaced cones read as "rendered" in the footage): uneven spacing,
  // thickness, lean and tip length; some tips off-centre or snapped flat
  for (let x = 0; x < length; x += step * (0.8 + r() * 0.45)) {
    const h = height * (0.78 + r() * 0.34), lean = (r() - 0.5) * 0.16, rad = 0.12 + r() * 0.07, top = V(x + lean, h - 0.4, (r() - 0.5) * 0.08);
    g.add(log(V(x, -0.3, 0), top, rad, WOOD_DARK));
    if (r() < 0.15) continue; // snapped: a flat broken top
    const len = 0.3 + r() * 0.45, tip = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 6), WOOD_DARK);
    tip.position.set(top.x + (r() - 0.5) * 0.05, top.y + len / 2 - 0.02, top.z); tip.rotation.set((r() - 0.5) * 0.25, r() * 6, (r() - 0.5) * 0.25); g.add(tip);
  }
  g.add(log(V(-0.1, height * 0.55, 0.16), V(length, height * 0.55, 0.16), 0.08)); // cross brace
  return g;
}

/** a tipped two-wheeled cart */
export function cart(seed = 1): THREE.Group {
  const g = new THREE.Group(), r = rng(seed);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.3), WOOD); bed.position.y = 0.75; g.add(bed);
  for (const z of [-0.65, 0.65]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.06), WOOD); side.position.set(0, 0.98, z); g.add(side);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 18), WOOD_DARK); wheel.position.set(0.2, 0.55, z * 1.12); g.add(wheel);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI; g.add(log(V(0.2 + Math.cos(a) * 0.52, 0.55 + Math.sin(a) * 0.52, z * 1.12), V(0.2 - Math.cos(a) * 0.52, 0.55 - Math.sin(a) * 0.52, z * 1.12), 0.025)); }
  }
  g.add(log(V(1.1, 0.75, -0.3), V(3.0, 0.05, -0.25), 0.05)); g.add(log(V(1.1, 0.75, 0.3), V(3.0, 0.05, 0.35), 0.05)); // shafts down in the mud
  g.rotation.z = 0.12 + r() * 0.1; // tipped
  return g;
}

/** a banner on a leaning pole */
export function banner(seed = 1): THREE.Group {
  const r = rng(seed), g = spear(seed, 3.2);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.9, 4, 4), clay(0.24));
  (cloth.material as THREE.Material).side = THREE.DoubleSide;
  cloth.position.set(0.38, 2.4 + r() * 0.3, 0); cloth.rotation.y = r() * 0.6; g.add(cloth);
  return g;
}

/** a pile of debris planks lying in the mud */
export function debris(seed = 1, count = 6): THREE.Group {
  const g = new THREE.Group(), r = rng(seed);
  for (let k = 0; k < count; k++) {
    const a = V((r() - 0.5) * 2, 0.04 + r() * 0.1, (r() - 0.5) * 2), yaw = r() * Math.PI, len = 0.8 + r() * 1.6;
    g.add(log(a, a.clone().add(V(Math.cos(yaw) * len, r() * 0.25, Math.sin(yaw) * len)), 0.04 + r() * 0.03));
  }
  return g;
}

export const WOOD_PIECES: Record<string, Piece> = {
  fence: { build: fence, args: [A('length', 1, 40, 6), SEED, A('broken', 0, 1, 0.3)], extent: (a) => [0, a[0] ?? 6, 0.4], doc: 'split-rail fence along +x, posts and 2-3 rails, some rails dropped to the mud' },
  spear: { build: spear, args: [SEED, A('length', 0.5, 6, 2.6)], extent: around(1.2), doc: 'a spear or stake stuck in the ground at a slant, steel tip' },
  palisade: { build: palisade, args: [A('length', 1, 40, 8), SEED, A('height', 1, 6, 3)], extent: (a) => [0, a[0] ?? 8, 0.3], doc: 'wall of pointed upright logs along +x with a cross brace' },
  cart: { build: cart, args: [SEED], extent: around(2), doc: 'tipped two-wheeled cart, shafts down in the mud' },
  banner: { build: banner, args: [SEED], extent: around(1.2), doc: 'a leaning pole with a small dark flag' },
  debris: { build: debris, args: [SEED, A('count', 1, 20, 6, true)], extent: around(1.5), doc: 'a loose pile of planks lying on the ground' },
}
