// Leaving a kit world frees what it put on the GPU (review M1, m4). No renderer in vitest, so resources are counted: every geometry,
// material and texture reachable from a built world (BATTLEFIELD, all its kit pieces) and from a 3D performer is collected before
// the lab re-parents it, every dispose() call is recorded, and leaving must have disposed all of them, lights and the tufts
// InstancedMesh included. The kit's shared module-level materials are the one exception, and a world built after another was
// disposed still draws with them.
import * as THREE from 'three'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { isShared } from '../../../../stage3d/dispose'
import { BATTLEFIELD, WALK_TOWARD } from '../../../../stage3d/presets'
import { buildWorld } from '../../../../stage3d/world'
import { KitLayer } from '../KitLayer'
import { MocapLayer } from '../MocapLayer'
import { performer } from './performer'

const ID = 'loc-2026-10-23T03-00-01-000'
const disposed = new Set<unknown>()
const spies: { mockRestore(): void }[] = []

beforeAll(() => {
  // the sky's texture: no DOM image loader in node, so hand back a plain Texture and report it loaded
  spies.push(vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (_url, onLoad) {
    const t = new THREE.Texture() as THREE.Texture<HTMLImageElement>; onLoad?.(t); return t
  }))
  for (const proto of [THREE.BufferGeometry.prototype, THREE.Material.prototype, THREE.Texture.prototype, THREE.Object3D.prototype]) {
    const real = proto.dispose
    spies.push(vi.spyOn(proto, 'dispose').mockImplementation(function (this: unknown) { disposed.add(this); real.call(this) }))
  }
})
afterAll(() => { for (const s of spies) s.mockRestore(); vi.unstubAllGlobals() })

/** every GPU-backed resource under `root`: geometries, materials (shared ones apart), their textures, lights, instanced meshes */
function resources(root: THREE.Object3D) {
  const own = new Set<unknown>(), sharedMats = new Set<THREE.Material>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) own.add(m.geometry)
    for (const mat of m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []) {
      if (isShared(mat)) { sharedMats.add(mat); continue }
      own.add(mat)
      for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) own.add(v)
      for (const u of Object.values((mat as THREE.ShaderMaterial).uniforms ?? {})) if ((u.value as THREE.Texture)?.isTexture) own.add(u.value)
    }
    if ((o as THREE.Light).isLight || (o as THREE.InstancedMesh).isInstancedMesh) own.add(o)
  })
  return { own, sharedMats }
}

async function enter() {
  const world = buildWorld(BATTLEFIELD)
  const kitRes = resources(world.scene)
  const kit = new KitLayer(world, ID, BATTLEFIELD, WALK_TOWARD)
  const mocap = new MocapLayer(await performer(WALK_TOWARD), WALK_TOWARD, ID)
  const figRes = resources(mocap.object)
  const host = new THREE.Scene(); host.add(kit.group, mocap.object)
  return { kit, mocap, own: new Set([...kitRes.own, ...figRes.own]), sharedMats: new Set([...kitRes.sharedMats, ...figRes.sharedMats]) }
}
const leave = (s: Awaited<ReturnType<typeof enter>>) => { s.mocap.dispose(); s.kit.dispose() }
const live = (own: Set<unknown>) => [...own].filter((r) => !disposed.has(r))

describe('leaving a kit world', () => {
  it('disposes every geometry, own material, texture, light and InstancedMesh the world and the performer made', async () => {
    const s = await enter()
    const kinds = (pred: (r: unknown) => boolean) => [...s.own].filter(pred).length
    // the things the review named are in the set being checked
    expect(kinds((r) => (r as THREE.DirectionalLight).isDirectionalLight)).toBe(1)
    expect(kinds((r) => (r as THREE.HemisphereLight).isHemisphereLight)).toBe(1)
    expect(kinds((r) => (r as THREE.InstancedMesh).isInstancedMesh)).toBe(1)
    expect(kinds((r) => (r as THREE.ShaderMaterial).isShaderMaterial)).toBe(1)
    expect(kinds((r) => (r as THREE.Texture).isTexture)).toBe(1)
    expect(kinds((r) => (r as THREE.BufferGeometry).isBufferGeometry)).toBeGreaterThan(100)
    expect(live(s.own)).toHaveLength(s.own.size)
    leave(s)
    expect(live(s.own)).toEqual([])
    expect(s.mocap.object.parent).toBeNull()
    expect(s.kit.group.parent).toBeNull()
  })

  it('frees the key light\'s shadow map', () => {
    const world = buildWorld(BATTLEFIELD)
    let key: THREE.DirectionalLight | undefined
    world.scene.traverse((o) => { if ((o as THREE.DirectionalLight).isDirectionalLight) key = o as THREE.DirectionalLight })
    const map = new THREE.WebGLRenderTarget(4, 4); key!.shadow.map = map // what the renderer allocates on the first shadowed frame
    const freed = vi.spyOn(map, 'dispose')
    new KitLayer(world, ID, BATTLEFIELD, WALK_TOWARD).dispose()
    expect(freed).toHaveBeenCalledOnce()
  })

  it('building and leaving 5 times leaves no residue', async () => {
    const all = new Set<unknown>()
    for (let i = 0; i < 5; i++) { const s = await enter(); for (const r of s.own) all.add(r); leave(s) }
    expect(all.size).toBeGreaterThan(500)
    expect(live(all)).toEqual([])
  })

  it('never disposes the shared kit materials, so a world built after one was left still has them', async () => {
    const a = await enter()
    expect(a.sharedMats.size).toBeGreaterThan(0)
    leave(a)
    for (const m of a.sharedMats) expect(disposed.has(m), m.name || m.uuid).toBe(false)
    const b = await enter()
    for (const m of b.sharedMats) expect(disposed.has(m)).toBe(false)
    // B's own resources are fresh and live, and B uses the same shared materials A did
    expect(live(b.own)).toHaveLength(b.own.size)
    expect([...a.sharedMats].some((m) => b.sharedMats.has(m))).toBe(true)
    leave(b)
    expect(live(b.own)).toEqual([])
  })
})
