// The fitted bodies of one performance as soft-shaded, per-part tinted meshes under the pack's source camera, posed per
// frame from the baked cache. Unlit material with the shading baked into vertex colours (a fixed soft light, so the look
// does not depend on the stage's lights): a hemisphere ambient plus a key from above and behind the take's camera.
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3, type PerspectiveCamera } from 'three'
import type { BodyData } from './bodiesCache'

interface Part { geo: BufferGeometry; pos: BufferAttribute; col: BufferAttribute; base: Float32Array; data: BodyData['objects'][number] }

export class BodiesLayer {
  readonly group = new Group()
  /** the frame shown (-1 before the first) */
  current = -1
  /** ms to pose + shade the last frame */
  lastMs = 0
  private readonly parts: Part[] = []
  private readonly light: Vector3
  private readonly material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })

  private readonly data: BodyData

  constructor(data: BodyData, camera: PerspectiveCamera) {
    this.data = data
    this.group.name = 'bodies-e39'
    // light in source-camera space: world (0.35, 0.85, 0.4) (up, a little toward the camera and to the side)
    this.light = new Vector3(0.35, 0.85, 0.4).normalize().applyQuaternion(camera.quaternion.clone().invert())
    for (const d of data.objects) {
      const geo = new BufferGeometry()
      const pos = new BufferAttribute(new Float32Array(d.obj.verts * 3), 3)
      pos.setUsage(35048) // DynamicDrawUsage
      const col = new BufferAttribute(new Float32Array(d.obj.verts * 3), 3)
      col.setUsage(35048)
      const base = new Float32Array(d.obj.verts * 3)
      for (let i = 0; i < base.length; i++) base[i] = (d.colors[i] / 255) ** 2.2 // sRGB bytes -> linear, as the renderer expects
      geo.setAttribute('position', pos)
      geo.setAttribute('color', col)
      geo.setIndex(new BufferAttribute(d.indices, 1))
      const mesh = new Mesh(geo, this.material)
      mesh.frustumCulled = false
      mesh.name = `bodies-e39:${d.obj.id}`
      this.group.add(mesh)
      this.parts.push({ geo, pos, col, base, data: d })
    }
    camera.add(this.group)
  }

  get frames() { return this.data.meta.frames }

  show(i: number) {
    if (i === this.current) return
    this.current = i
    const t0 = performance.now()
    const f = Math.min(Math.max(i, 0), this.frames - 1)
    this.group.visible = i >= 0
    const L = this.light
    for (const p of this.parts) {
      const n = p.data.obj.verts
      p.pos.array.set(p.data.positions.subarray(f * n * 3, (f + 1) * n * 3))
      p.pos.needsUpdate = true
      p.geo.computeVertexNormals()
      const nor = p.geo.attributes.normal.array as Float32Array, c = p.col.array as Float32Array
      for (let v = 0; v < n; v++) {
        const lam = nor[v * 3] * L.x + nor[v * 3 + 1] * L.y + nor[v * 3 + 2] * L.z
        // facing the camera a little brighter (soft rim of the form), never black
        const k = 0.42 + 0.5 * Math.max(0, lam) + 0.12 * Math.max(0, nor[v * 3 + 2])
        c[v * 3] = p.base[v * 3] * k; c[v * 3 + 1] = p.base[v * 3 + 1] * k; c[v * 3 + 2] = p.base[v * 3 + 2] * k
      }
      p.col.needsUpdate = true
    }
    this.lastMs = performance.now() - t0
  }

  dispose() {
    for (const p of this.parts) p.geo.dispose()
    this.material.dispose()
    this.group.removeFromParent()
  }
}
