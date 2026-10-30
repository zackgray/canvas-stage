// Shared kit plumbing: clay materials, seeded rng, the log helper, and the per-kind spec (args, footprint, one-line description).
import * as THREE from 'three'
import { shared } from '../dispose.ts'

export const clay = (shade = 0.62, rough = 0.9): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: new THREE.Color(shade, shade, shade), roughness: rough, metalness: 0 });
// module-level, shared by every world: marked so a world's dispose leaves them for the next one (src/stage3d/dispose.ts)
const sclay = (shade?: number, rough?: number) => shared(clay(shade, rough));
export const WOOD = sclay(0.42), WOOD_DARK = sclay(0.3), STEEL = sclay(0.7, 0.45), CLOTH = sclay(0.5), STONE = sclay(0.48), EARTH = sclay(0.36, 1), STRAW = sclay(0.58, 1), BARK = sclay(0.26, 1), FOLIAGE = sclay(0.2, 1);
/** the back row of a treeline: paler, as distance and haze make it */
export const FOLIAGE_FAR = sclay(0.3, 1);

// deterministic random so a plan always builds the same world
export function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** a roughly round log between two points; slight taper */
export function log(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material = WOOD, taper = 0.85): THREE.Mesh {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * taper, r, len, 7, 1), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** a solid box with its base at y0 (default 0), centred on (x, z) */
export function slab(w: number, h: number, d: number, x: number, z: number, mat: THREE.Material, y0 = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y0 + h / 2, z); m.castShadow = m.receiveShadow = true; return m;
}

/** one kit argument: name, allowed range, the default the builder uses when a plan omits it */
export type ArgSpec = { name: string; min: number; max: number; def: number; int?: boolean }
export const A = (name: string, min: number, max: number, def: number, int = false): ArgSpec => ({ name, min, max, def, int });
export const SEED = A('seed', 0, 99999, 1, true);

/** a kit piece: builder, argument spec (validated by plan.ts), local footprint and a one-line description for the LLM prompt */
export type Piece = {
  build: (...a: number[]) => THREE.Object3D
  args: ArgSpec[]
  /** local footprint of the piece along its +x axis: [x0, x1, halfWidth] in metres (origin = placement point) */
  extent: (a: number[]) => [number, number, number]
  doc: string
}
export const around = (r: number) => (): [number, number, number] => [0, 0, r]
