// Nature family: rock (from the spike), tree, dead tree, haystack, distant treeline strip. All solid, neutral clay.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bandTree, blob, put, trunk } from './organic.ts'
import { A, SEED, STONE, BARK, FOLIAGE, FOLIAGE_FAR, STRAW, V, log, rng, around, type Piece } from './common.ts'

/** a lumpy rock */
export function rock(seed = 1, size = 0.6): THREE.Mesh {
  const r = rng(seed), geo = new THREE.IcosahedronGeometry(size, 1), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.75 + r() * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.6, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, STONE); m.castShadow = m.receiveShadow = true; return m;
}

/** a dead tree: leaning trunk, a few thick forked branches, broken stubs; no leaves */
export function deadTree(seed = 1, height = 5): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), lean = (r() - 0.5) * height * 0.12, tr = 0.1 + height * 0.035;
  g.add(log(V(0, -0.3, 0), V(lean, height, 0), tr, BARK, 0.35));
  const fork = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len); g.add(log(from, to, rad, BARK, 0.5));
    if (depth <= 0) return;
    for (let k = 0; k < 2; k++) {
      const d = dir.clone().add(V((r() - 0.5) * 1.2, 0.35 + r() * 0.4, (r() - 0.5) * 1.2)).normalize();
      if (r() < 0.8) fork(to.clone().addScaledVector(dir, -len * 0.15), d, len * (0.55 + r() * 0.25), rad * 0.6, depth - 1);
    }
  };
  const n = 4 + Math.round(r() * 2);
  for (let k = 0; k < n; k++) {
    const t = 0.38 + (k / n) * 0.55, a = r() * Math.PI * 2, from = V(lean * t, height * t, 0);
    fork(from, V(Math.cos(a) * 0.8, 0.5 + r() * 0.5, Math.sin(a) * 0.8).normalize(), height * (0.28 - t * 0.12), tr * (0.75 - t * 0.35), 1);
  }
  return g;
}

/**
 * a living tree: a short leaning trunk under a full lobed crown (a core mass with lumpy lobes around and above it, a ragged top,
 * lobes poking out at the sides), so it reads as foliage from every side, never a ball on a stick. `crownWidth` is the crown's diameter in metres.
 */
export function tree(seed = 1, height = 6, crownWidth = 4): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), lean = (r() - 0.5) * height * 0.08, base = height * (0.3 + r() * 0.1)
  const crownH = height - base, cw = crownWidth / 2
  const bark = new THREE.Mesh(trunk(r, base + crownH * 0.45, height * 0.03 + 0.06, lean, 0, 6), BARK)
  bark.position.y = -0.3; bark.castShadow = bark.receiveShadow = true; g.add(bark)
  const cy = base + crownH * 0.5, parts: THREE.BufferGeometry[] = [put(blob(r, cw * 0.62, 1, crownH / (cw * 1.5), 1, 0.3), lean, cy, 0, r() * 6.283)]
  for (let k = 0, n = 8 + Math.floor(r() * 4); k < n; k++) {
    const t = (k + r()) / n, a = r() * 6.283, ring = 0.35 + r() * 0.5, y = cy + (t - 0.4) * crownH * 0.9
    const d = cw * ring * (1 - Math.abs(t - 0.4) * 0.6), rad = cw * (0.3 + r() * 0.22)
    parts.push(put(blob(r, rad, 0.9 + r() * 0.4, 0.75 + r() * 0.45, 0.9 + r() * 0.4, 0.4), lean + Math.cos(a) * d, y, Math.sin(a) * d, r() * 6.283))
  }
  const crown = new THREE.Mesh(mergeGeometries(parts)!, FOLIAGE); crown.castShadow = crown.receiveShadow = true; g.add(crown)
  return g;
}

/** a haystack: an uneven mound of straw, a main heap with one or two slumped lumps against it; no cone, no clean dome */
export function haystack(seed = 1, size = 1.4): THREE.Mesh {
  const r = rng(seed), s = size, parts: THREE.BufferGeometry[] = [put(blob(r, s, 1.0 + r() * 0.2, 0.95 + r() * 0.2, 0.85 + r() * 0.2, 0.2), 0, s * 0.55, 0, r() * 6.283)];
  for (let k = 0, n = 1 + Math.round(r()); k < n; k++) {
    const a = r() * 6.283, d = s * (0.55 + r() * 0.3), q = s * (0.4 + r() * 0.25);
    parts.push(put(blob(r, q, 1.1, 0.6 + r() * 0.2, 1, 0.3), Math.cos(a) * d, q * 0.5, Math.sin(a) * d, r() * 6.283));
  }
  const m = new THREE.Mesh(mergeGeometries(parts)!, STRAW); m.castShadow = m.receiveShadow = true; return m;
}

/**
 * a distant treeline: a ragged band of trees along x, centred on the placement point, in three rows. Trees are clumped with gaps,
 * their heights ride a slow swell with a few tall ones standing out, and each crown is a scatter of small lumpy lobes (organic.ts
 * bandTree) so the band's top edge is broken, never a row of balls or cones. The back row is lower, denser and paler, so the band
 * thins into the haze behind it the way a real wood does. Chunks follow the ground.
 */
export function treeline(length = 100, seed = 1, height = 8): THREE.Group {
  const g = new THREE.Group(), r = rng(seed), chunk = 12, ph = r() * 6.283
  const rows: { by: Map<number, THREE.BufferGeometry[]>; mat: THREE.Material }[] = [{ by: new Map(), mat: FOLIAGE }, { by: new Map(), mat: FOLIAGE }, { by: new Map(), mat: FOLIAGE_FAR }]
  rows.forEach(({ by }, row) => {
    const far = row === 2, step = far ? 0.3 : row ? 0.36 : 0.42
    for (let x = -length / 2 + r() * height * 0.4; x <= length / 2; x += height * (step + r() * step)) {
      if (!far && r() < 0.12) x += height * (0.5 + r()) // a gap in the wood
      const swell = 0.8 + 0.3 * Math.sin(x * 0.07 + ph + row * 1.7), tall = !far && r() < 0.08 ? 1.35 : 1
      const h = height * swell * tall * (far ? 0.55 + r() * 0.35 : 0.45 + r() * 0.9), z = [1, -1, -2.2][row] * height * (0.1 + r() * 0.4)
      const c = Math.round(x / chunk), cx = c * chunk
      by.set(c, [...(by.get(c) ?? []), ...bandTree(r, x - cx, z, h, far ? 1.3 : 1)])
    }
  })
  for (const { by, mat } of rows) for (const [c, geos] of by) {
    const m = new THREE.Mesh(mergeGeometries(geos)!, mat)
    m.position.x = c * chunk; m.castShadow = m.receiveShadow = true; m.userData.snap = true; g.add(m)
  }
  return g;
}

export const NATURE_PIECES: Record<string, Piece> = {
  rock: { build: rock, args: [SEED, A('size', 0.1, 4, 0.6)], extent: (a) => { const r = (a[1] ?? 0.6) * 1.2; return [0, 0, r] }, doc: 'a lumpy grey boulder; size is its radius in metres' },
  deadTree: { build: deadTree, args: [SEED, A('height', 2.5, 9, 5)], extent: around(1.5), doc: 'bare dead tree: leaning trunk with forked branches, no leaves' },
  tree: { build: tree, args: [SEED, A('height', 3, 12, 6), A('crownWidth', 1.5, 9, 4)], extent: (a) => [0, 0, (a[2] ?? 4) * 1.1], doc: 'living tree with a leafy lobed crown: orchards, parks, gardens; crownWidth is the crown diameter in metres' },
  haystack: { build: haystack, args: [SEED, A('size', 0.8, 2.5, 1.4)], extent: (a) => { const r = (a[1] ?? 1.4) * 1.1; return [0, 0, r] }, doc: 'rounded haystack dome; size is its radius' },
  treeline: { build: treeline, args: [A('length', 20, 200, 100), SEED, A('height', 4, 14, 8)], extent: (a) => [-(a[0] ?? 100) / 2, (a[0] ?? 100) / 2, (a[2] ?? 8) * 0.5], doc: 'ragged band of dark, uneven trees (broken crowns, a few tall ones, gaps, a paler back row) along x, centred on the placement point; put it 60-150 m away to break the horizon' },
}
