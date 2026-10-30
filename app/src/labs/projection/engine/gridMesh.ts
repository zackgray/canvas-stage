import { BufferAttribute, BufferGeometry, Mesh, type Material } from 'three'
import type { GridMesh } from '../math/grid'

/** The displaced grid as a three.js mesh in projector camera space (never culled: it surrounds the projector). */
export function gridMesh(grid: GridMesh, material: Material): Mesh {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(grid.positions, 3))
  geo.setAttribute('uv', new BufferAttribute(grid.uvs, 2))
  geo.setIndex(new BufferAttribute(grid.indices, 1))
  const mesh = new Mesh(geo, material)
  mesh.frustumCulled = false
  return mesh
}
