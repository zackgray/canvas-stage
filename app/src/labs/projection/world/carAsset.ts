// The stage car: car-a.json says where the Float32 positions, (baked) normals, linear vertex colours and Uint32 indices
// sit in car-a.bin. Already in metres, levelled (the 4.19° fix baked in), front to +X, +Y up, tyre contacts at y = 0,
// X/Z centred: it stands on the plane as loaded. The committed asset is the E24 car decimated by
// scripts/decimate-car.ts; the raw E24 mesh (gitignored lab-assets) is the fallback; with neither the car stays the
// placeholder box and says so.
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import type { V3 } from './geom'

export const CAR_ASSET = '/assets/car/car-a'
export const CAR_LAB_ASSET = '/lab-assets/experiments/e24/car-a'

export interface CarMeta {
  vertices: number
  layout: { positions: [number, number]; normals?: [number, number]; colors?: [number, number]; indices: [number, number] }
  sizeM?: V3
}

export interface CarArrays {
  positions: Float32Array; normals: Float32Array | null; colors: Float32Array | null; indices: Uint32Array; size: V3
}

/** Slice the bin by the meta's [byte offset, byte length] layout; throws on a bin that does not hold it. */
export function parseCar(meta: CarMeta, bin: ArrayBuffer): CarArrays {
  const n = meta.vertices
  const view = <T>(k: keyof CarMeta['layout'], make: (b: ArrayBuffer, o: number, c: number) => T, per: number): T => {
    const [off, bytes] = meta.layout[k]!
    if (off + bytes > bin.byteLength || off % 4) throw new Error(`car bin too short for ${k} (${off}+${bytes} > ${bin.byteLength})`)
    return make(bin, off, bytes / per)
  }
  const positions = view('positions', (b, o, c) => new Float32Array(b, o, c), 4)
  if (positions.length !== n * 3) throw new Error(`car positions: ${positions.length} floats for ${n} vertices`)
  const normals = meta.layout.normals ? view('normals', (b, o, c) => new Float32Array(b, o, c), 4) : null
  if (normals && normals.length !== n * 3) throw new Error(`car normals: ${normals.length} floats for ${n} vertices`)
  const colors = meta.layout.colors ? view('colors', (b, o, c) => new Float32Array(b, o, c), 4) : null
  const indices = view('indices', (b, o, c) => new Uint32Array(b, o, c), 4)
  return { positions, normals, colors, indices, size: meta.sizeM ?? measure(positions) }
}

function measure(p: Float32Array): V3 {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i++) { const k = i % 3; mn[k] = Math.min(mn[k], p[i]); mx[k] = Math.max(mx[k], p[i]) }
  return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
}

export function carMesh(a: CarArrays): Mesh {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(a.positions, 3))
  if (a.colors) g.setAttribute('color', new BufferAttribute(a.colors, 3))
  g.setIndex(new BufferAttribute(a.indices, 1))
  if (a.normals) g.setAttribute('normal', new BufferAttribute(a.normals, 3))
  else g.computeVertexNormals()
  const mesh = new Mesh(g, new MeshStandardMaterial({ vertexColors: !!a.colors, color: a.colors ? 0xffffff : 0x9a3b2e, roughness: 0.45, metalness: 0.15 }))
  mesh.name = 'car-a'
  return mesh
}

export type LoadedCar = { mesh: Mesh; size: V3; base?: string } | { missing: string }

/** The committed car, else the raw lab mesh when that one is on disk; the reasons for both when neither loads. */
export async function loadCar(bases: string[] = [CAR_ASSET, CAR_LAB_ASSET]): Promise<LoadedCar> {
  const why: string[] = []
  for (const base of bases) {
    const got = await loadCarFrom(base)
    if (!('missing' in got)) return got
    why.push(got.missing)
  }
  return { missing: why.join('; ') }
}

/** Fetch and build the car from one base; the reason when the asset is not on disk (or not what it should be). */
export async function loadCarFrom(base: string): Promise<LoadedCar> {
  const miss = (why: string) => ({ missing: `${base}.bin/.json ${why}` })
  try {
    const mr = await fetch(`${base}.json`)
    if (!mr.ok || !(mr.headers.get('content-type') ?? '').includes('json')) return miss('not found')
    const meta = (await mr.json()) as CarMeta
    const br = await fetch(`${base}.bin`)
    if (!br.ok) return miss('not found')
    const arrays = parseCar(meta, await br.arrayBuffer())
    return { mesh: carMesh(arrays), size: arrays.size, base }
  } catch (e) {
    return miss(`unreadable: ${e instanceof Error ? e.message : String(e)}`)
  }
}
