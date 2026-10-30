// Freeing what a Stage3D world or figure put on the GPU: geometries, materials and their textures (ShaderMaterial uniforms
// included), lights (a DirectionalLight's shadow map) and InstancedMesh buffers. Module-level materials that several worlds or
// figures share (the kit's WOOD, STEEL ... and the mannequin's FIGURE_CLAY) are registered with `shared` and never freed here:
// another world built later still draws with them, and they hold no textures (three re-uploads a disposed material on next use,
// but freeing them on every exit would only churn shader programs).
import type * as THREE from 'three'

const SHARED = new WeakSet<THREE.Material>()

/** mark a module-level material as shared: disposeTree leaves it alone. A `.clone()` of it is not shared. */
export function shared<M extends THREE.Material>(m: M): M { SHARED.add(m); return m }
export const isShared = (m: THREE.Material) => SHARED.has(m)

const SHARED_GEO = new WeakSet<THREE.BufferGeometry>()

/** mark a geometry that several worlds' meshes share (a cached GLB's): disposeTree leaves it; its owner (glbCache) frees it on eviction */
export function sharedGeometry<G extends THREE.BufferGeometry>(g: G): G { SHARED_GEO.add(g); return g }
export const isSharedGeometry = (g: THREE.BufferGeometry) => SHARED_GEO.has(g)

type Disposable = { dispose?: () => void }
const isTexture = (v: unknown): v is THREE.Texture => !!v && typeof v === 'object' && (v as { isTexture?: boolean }).isTexture === true

function disposeMaterial(m: THREE.Material, seen: Set<unknown>) {
  if (seen.has(m) || SHARED.has(m)) return
  seen.add(m)
  for (const v of Object.values(m)) if (isTexture(v) && !seen.has(v)) { seen.add(v); v.dispose() }
  const uniforms = (m as { uniforms?: Record<string, { value?: unknown }> }).uniforms
  if (uniforms) for (const u of Object.values(uniforms)) if (isTexture(u?.value) && !seen.has(u.value)) { seen.add(u.value); u.value.dispose() }
  m.dispose()
}

/**
 * Dispose every resource under each root: geometries, non-shared materials and their textures, and every object's own dispose()
 * (lights free their shadow maps, an InstancedMesh its instance buffers). Each resource is disposed once however often it is used.
 */
export function disposeTree(...roots: THREE.Object3D[]) {
  const seen = new Set<unknown>()
  for (const root of roots) root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry
    if (g && !seen.has(g)) { seen.add(g); if (!SHARED_GEO.has(g)) g.dispose() }
    const mat = (o as THREE.Mesh).material
    if (mat) for (const m of Array.isArray(mat) ? mat : [mat]) disposeMaterial(m, seen)
    ;(o as Disposable).dispose?.()
  })
}
