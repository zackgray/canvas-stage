// Generated set pieces in a Stage3D world (recipe wave; E136/E137): a KitItem with `glb` is a TRELLIS.2 mesh loaded from disk, not a
// KIT builder. buildWorld stays synchronous: it adds one empty holder group to the scene at once (so KitLayer, which moves the
// scene's children out when it is made, takes the holder with the rest) and the pieces land in it behind World3D.ready, which every
// capture awaits. Each piece is the precise mesh plus, when the plan names one, its massing mesh (E139), hidden: setMassing swaps
// them for the model-facing clay. The meshes are normalised as E137 did (centred on x/z, base on y = 0) and turned by
// yawOffsetDeg so their fronts face +z, scaled by unitScale (metres per mesh unit) times the item's scale, sunk by `sink`.
import * as THREE from 'three'
import type { KitItem } from './contract.ts'
import { ENTITY_TAG_RE } from './contract.ts'
import { clay } from './kit.ts'
import { disposeTree } from './dispose.ts'
import { pieceKindOf } from './pieceKinds.ts'
import { movePoseAt, pieceTurnDeg } from './propMove.ts'

/** loads one GLB's scene; tests swap it for a fixture reader */
export type { GlbLoad } from './glbCache.ts'
import type { GlbLoad } from './glbCache.ts'

/** what a piece's loader says when the server answers without the mesh: plain words, never a JSON parse error */
export const GLB_NOT_SERVED = 'the server sent a web page instead of the 3D file (the file may still be being written, or this dev server does not serve it yet)'

/** true when the bytes open with the binary glTF magic ("glTF"); a dev server's HTML fallback starts with "<" */
export function isGlb(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength))
  return b.length === 4 && b[0] === 0x67 && b[1] === 0x6c && b[2] === 0x54 && b[3] === 0x46
}

/** the browser's loader: fetch the bytes, parse them (no textures: shape-only meshes) */
export const fetchGlb: GlbLoad = async (url) => {
  const res = await fetch(url)
  if (res.status === 404) throw new Error('the 3D file is not on the server')
  if (!res.ok) throw new Error(`the server could not send the 3D file (HTTP ${res.status})`)
  const buf = await res.arrayBuffer()
  // a 200 with index.html (Vite's fallback for a file its public index never learned of) would reach GLTFLoader as JSON text
  if (!isGlb(buf)) throw new Error(GLB_NOT_SERVED)
  return parseGlb(buf)
}

export async function parseGlb(buf: ArrayBuffer): Promise<THREE.Object3D> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  return new Promise((ok, no) => new GLTFLoader().parse(buf, '', (g) => ok(g.scene), (e) => no(e instanceof Error ? e : new Error(String(e)))))
}

export { memoGlb } from './glbCache.ts'
import { memoGlb } from './glbCache.ts'

let loader: GlbLoad = memoGlb(fetchGlb)
/** tests only: the loader every world uses from now on (returns the one it replaced) */
export function setGlbLoader(l: GlbLoad): GlbLoad { const old = loader; loader = l; return old }

/** userData keys on a piece's two meshes, so the massing swap and the tests find them */
export const GLB_PRECISE = 'glbPrecise', GLB_MASSING = 'glbMassing'

function clayed(o: THREE.Object3D, mat: THREE.Material, role: string): THREE.Object3D {
  o.userData[role] = true
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    m.material = mat
    if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals()
    m.castShadow = m.receiveShadow = true
  })
  return o
}

/** One piece placed on the ground: precise (and hidden massing) meshes under a group at the item's place, turn and size. */
export function placeGlb(it: KitItem, precise: THREE.Object3D, massing: THREE.Object3D | null, groundAt: (x: number, z: number) => number): THREE.Group {
  const g = it.glb!
  const mat = clay(pieceKindOf(it.kind).tone, 0.95)
  const box = new THREE.Box3().setFromObject(precise), c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
  const base = box.isEmpty() ? 0 : box.min.y
  // the massing shares the precise mesh's frame (massing.py keeps it), so both take the precise mesh's offset and stay aligned
  for (const o of [precise, massing]) if (o) o.position.set(-c.x, -base, -c.z)
  const piece = new THREE.Group()
  piece.add(clayed(precise, mat, GLB_PRECISE))
  if (massing) { piece.add(clayed(massing, mat, GLB_MASSING)); massing.visible = false }
  const pose = movePoseAt(it, 0) // a travelling piece starts at its path's first point (its `at` stays the resting place)
  const px = pose?.at[0] ?? it.at[0], pz = pose?.at[1] ?? it.at[1]
  piece.rotation.order = 'YXZ'
  piece.rotation.y = (pieceTurnDeg(it, pose) * Math.PI) / 180
  piece.rotation.x = ((it.pitchDeg ?? 0) * Math.PI) / 180
  piece.rotation.z = ((it.rollDeg ?? 0) * Math.PI) / 180
  piece.scale.setScalar((g.unitScale ?? 1) * (it.scale ?? 1))
  piece.position.set(px, groundAt(px, pz) + (it.lift ?? 0) - (g.sink ?? 0), pz)
  if (it.pieceTag && ENTITY_TAG_RE.test(it.pieceTag)) { piece.userData.entity = it.pieceTag; piece.name = it.pieceTag }
  return piece
}

/**
 * Load every glb item into `holder`. Rejects (naming the piece) when a mesh does not load: a clay missing the train would draw a
 * paid still of the wrong set. A world disposed before its pieces land frees them as they arrive instead of adding them.
 */
export async function loadGlbPieces(items: KitItem[], holder: THREE.Group, groundAt: (x: number, z: number) => number, disposed: () => boolean, load: GlbLoad = loader): Promise<void> {
  const cache = new Map<string, Promise<THREE.Object3D>>()
  const get = (url: string) => { let p = cache.get(url); if (!p) { p = load(url); cache.set(url, p) } return p.then((o) => o.clone(true)) }
  const placed = await Promise.all(items.map(async (it) => {
    try {
      const [precise, massing] = await Promise.all([get(it.glb!.url), it.glb!.massingUrl ? get(it.glb!.massingUrl) : Promise.resolve(null)])
      return placeGlb(it, precise, massing, groundAt)
    } catch (e) {
      throw new Error(`the 3D piece "${it.kind}" did not load: ${e instanceof Error ? e.message : String(e)} (${it.glb!.url})`)
    }
  }))
  if (disposed()) { disposeTree(...placed); return }
  for (const p of placed) holder.add(p)
}

/** Show each generated piece's massing mesh (true) or its precise one (false); returns how many pieces have a massing mesh. */
export function setMassing(root: THREE.Object3D, on: boolean): number {
  let n = 0
  root.traverse((o) => {
    if (o.userData[GLB_MASSING]) { o.visible = on; n++ }
    else if (o.userData[GLB_PRECISE]) o.visible = !on || !o.parent?.children.some((s) => s.userData[GLB_MASSING])
  })
  return n
}
