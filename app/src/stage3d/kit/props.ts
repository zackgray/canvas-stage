// Props family: fire (from the spike), barrels, crates, campfire ring.
import * as THREE from 'three'
import { A, SEED, WOOD, WOOD_DARK, STONE, STEEL, V, log, rng, slab, around, type Piece } from './common.ts'

/** a fire: bright emissive flame cones and a warm point light (clay reads the fire as the brightest thing in frame) */
export function fire(seed = 1, size = 1): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let k = 0; k < 6; k++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.3 * size, (0.9 + r()) * size, 6), mat);
    c.position.set((r() - 0.5) * size, 0.45 * size, (r() - 0.5) * size * 0.5); c.rotation.z = (r() - 0.5) * 0.5; g.add(c);
  }
  const light = new THREE.PointLight(0xffb070, 18 * size, 14 * size, 1.6); light.position.y = 1.2 * size; g.add(light);
  return g;
}

/** one barrel: a bulging closed lathe with two metal hoops */
function barrel(r: () => number): THREE.Group {
  const g = new THREE.Group(), h = 0.9 + r() * 0.15, w = 0.38;
  const prof = [[0, 0], [w * 0.85, 0], [w, h * 0.3], [w * 1.08, h * 0.5], [w, h * 0.7], [w * 0.85, h], [0, h]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 12), WOOD); body.castShadow = body.receiveShadow = true; g.add(body);
  for (const y of [0.22, 0.68]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(w * (y > 0.5 ? 0.98 : 0.93) + 0.03, 0.02, 4, 14), STEEL); hoop.rotation.x = Math.PI / 2; hoop.position.y = y * h / 0.9; g.add(hoop); }
  return g;
}

/** a cluster of barrels: mostly upright, some tipped on their side */
export function barrels(seed = 1, count = 4): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), n = Math.round(count);
  for (let k = 0; k < n; k++) {
    const b = barrel(r), a = r() * Math.PI * 2, d = k === 0 ? 0 : 0.7 + r() * 0.5 + k * 0.08;
    b.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    if (k > 0 && r() < 0.35) { b.rotation.z = Math.PI / 2; b.rotation.y = r() * 6; b.position.y = 0.4; } else b.rotation.y = r() * 6;
    g.add(b);
  }
  return g;
}

/** crates: a few square boxes stacked and scattered with slat edges */
export function crates(seed = 1, count = 4): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), n = Math.round(count), tops: { x: number; z: number; y: number }[] = [];
  for (let k = 0; k < n; k++) {
    const s = 0.55 + r() * 0.3, base = tops.length && r() < 0.4 ? tops[Math.floor(r() * tops.length)] : null;
    const x = base ? base.x + (r() - 0.5) * 0.15 : (r() - 0.5) * 2.2, z = base ? base.z + (r() - 0.5) * 0.15 : (r() - 0.5) * 1.6, y = base ? base.y : 0;
    const box = slab(s, s, s * (0.85 + r() * 0.3), x, z, WOOD, y); box.rotation.y = (r() - 0.5) * 0.7; g.add(box);
    const band = slab(s * 1.03, s * 0.1, s * 1.0, x, z, WOOD_DARK, y + s * 0.45); band.rotation.y = box.rotation.y; g.add(band);
    tops.push({ x, z, y: y + s });
  }
  return g;
}

/** a campfire ring: a ring of stones, crossed logs and fire inside (needs fuel nearby: logs are the fuel) */
export function campfireRing(seed = 1, size = 1): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), n = 9 + Math.round(r() * 2), R = 0.6 * size;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, s = (0.13 + r() * 0.07) * size, m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), STONE);
    m.scale.y = 0.75; m.position.set(Math.cos(a) * R, s * 0.5, Math.sin(a) * R); m.rotation.set(r() * 3, r() * 3, r() * 3); m.castShadow = m.receiveShadow = true; g.add(m);
  }
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI + r() * 0.4; g.add(log(V(Math.cos(a) * R * 0.8, 0.12 * size, Math.sin(a) * R * 0.8), V(-Math.cos(a) * R * 0.8, 0.2 * size, -Math.sin(a) * R * 0.8), 0.06 * size, WOOD_DARK)); }
  const f = fire(seed, size * 0.7); f.position.y = 0.3 * size; g.add(f);
  return g;
}

export const PROP_PIECES: Record<string, Piece> = {
  fire: { build: fire, args: [SEED, A('size', 0.3, 3, 1)], extent: (a) => { const r = (a[1] ?? 1) * 0.6; return [0, 0, r] }, doc: 'bare bright flame cones with a warm light; size 1 = knee-high flames. Prefer campfireRing or put fuel (debris, palisade) beside it' },
  barrels: { build: barrels, args: [SEED, A('count', 1, 8, 4, true)], extent: (a) => { const r = 0.6 + (a[1] ?? 4) * 0.16; return [0, 0, r] }, doc: 'cluster of wooden barrels with hoops, some tipped over' },
  crates: { build: crates, args: [SEED, A('count', 1, 8, 4, true)], extent: around(1.6), doc: 'scattered and stacked wooden crates' },
  campfireRing: { build: campfireRing, args: [SEED, A('size', 0.6, 2, 1)], extent: (a) => { const r = (a[1] ?? 1) * 0.9; return [0, 0, r] }, doc: 'stone ring with crossed logs and a fire inside (has a warm light)' },
}
