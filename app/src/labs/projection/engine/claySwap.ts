// Swapping a mesh's material for its clay one and back, remembering the original so the owner's own cleanup (dispose, GPU
// free) still frees the material it made, not ours. Clay-only path: nothing here runs while the look is Textured.
import type { Material, Mesh } from 'three'

const swapped = new WeakMap<Mesh, { orig: Material | Material[]; clay: Material; shared: boolean }>()

/** Put `make(original)` on the mesh (once). `shared` = the clay material outlives this mesh (it is not freed on the way out). */
export function swapClay(mesh: Mesh, make: (orig: Material) => Material, shared = false) {
  if (swapped.has(mesh) || Array.isArray(mesh.material)) return
  const clay = make(mesh.material)
  swapped.set(mesh, { orig: mesh.material, clay, shared })
  mesh.material = clay
}

/** Give the mesh its own material back; an own clay material is freed. */
export function unswapClay(mesh: Mesh) {
  const s = swapped.get(mesh)
  if (!s) return
  mesh.material = s.orig
  if (!s.shared) s.clay.dispose()
  swapped.delete(mesh)
}

export const isClayed = (mesh: Mesh) => swapped.has(mesh)
