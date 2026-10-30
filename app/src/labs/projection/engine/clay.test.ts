import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Scene, ShaderMaterial, Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { clayKey, CLAY_KEY_BASE, clayKeyUniform, setClayYaw } from './clay'
import { setDomeClay, setFarClay, setPerformerClay } from './clayMaterials'
import { smoothedNormals } from './clayNormals'
import { createProjectionMaterial } from './materials'
import { Viewport } from './viewport'

const uniform = (m: Mesh) => (m.material as ShaderMaterial).uniforms.blocking.value as number

/** A Viewport on a scene that holds a set mesh, a surround and a performance group, each recording the clay calls it gets. */
function rig() {
  const scene = new Scene()
  const set = new Mesh(undefined, createProjectionMaterial(new Matrix4()))
  const log: string[] = []
  scene.userData.surround = { setClay: (on: boolean) => log.push(`surround:${on}`) }
  const perf = new Group()
  perf.userData.clayTarget = { setClay: (on: boolean) => log.push(`performer:${on}`) }
  scene.add(perf)
  const vp = new Viewport(scene, () => [set], new Mesh())
  return { scene, set, log, vp }
}

describe('Clay look switching', () => {
  it('reaches the set, the performer and the surround, and back to Textured', () => {
    const r = rig()
    r.vp.look.set('clay')
    expect(uniform(r.set)).toBe(2)
    expect(r.log).toEqual(['surround:true', 'performer:true'])
    r.vp.look.set('textured')
    expect(uniform(r.set)).toBe(0)
    expect(r.log.slice(2)).toEqual(['surround:false', 'performer:false'])
  })

  it('Blocking is untouched by Clay: it stays the grey geometry shading, and the clay layers are off', () => {
    const r = rig()
    r.vp.look.set('clay')
    r.vp.look.set('blocking')
    expect(uniform(r.set)).toBe(1)
    expect(r.log.at(-1)).toBe('performer:false')
  })

  it('captures render textured even with clay on: set, performer and surround are un-clayed inside, and clay returns after', () => {
    const r = rig()
    r.vp.look.set('clay')
    r.log.length = 0
    const seen = r.vp.offscreen(() => ({ set: uniform(r.set), log: [...r.log] }))
    expect(seen.set).toBe(0)
    expect(seen.log).toEqual(['surround:false', 'performer:false'])
    expect(uniform(r.set)).toBe(2)
    expect(r.log.slice(2)).toEqual(['surround:true', 'performer:true'])
    expect(r.vp.look.mode).toBe('clay')
  })

  it('puts clay back even when the capture throws', () => {
    const r = rig()
    r.vp.look.set('clay')
    expect(() => r.vp.offscreen(() => { throw new Error('boom') })).toThrow('boom')
    expect(uniform(r.set)).toBe(2)
  })
})

describe('Clay materials', () => {
  it('swaps the performer material for the shared clay one and gives the very same colour material back', () => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, -1, 1, 0, -1, 0, 1, -1]), 3))
    geo.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
    const basic = new MeshBasicMaterial()
    const m = new Mesh(geo, basic)
    setPerformerClay(m, true)
    expect(m.material).not.toBe(basic)
    expect(geo.getAttribute('normal')).toBeTruthy()
    const clay = m.material
    setPerformerClay(m, true)
    expect(m.material).toBe(clay)
    setPerformerClay(m, false)
    expect(m.material).toBe(basic)
  })

  it('swaps the surround meshes and shares their texture uniform, so a hi-res colour swap still reaches clay', () => {
    const map = { value: new Texture() }
    const far = new Mesh(undefined, new ShaderMaterial({ uniforms: { map }, vertexShader: 'void main(){}', fragmentShader: 'void main(){}' }))
    const orig = far.material
    setFarClay(far, true)
    expect(far.material).not.toBe(orig)
    expect((far.material as ShaderMaterial).uniforms.map).toBe(map)
    setFarClay(far, false)
    expect(far.material).toBe(orig)
    const dome = new Mesh(undefined, new ShaderMaterial({ uniforms: { sky: { value: null }, toLevel: { value: null } }, vertexShader: 'x', fragmentShader: 'y' }))
    const domeOrig = dome.material
    setDomeClay(dome, true)
    expect(dome.material).not.toBe(domeOrig)
    setDomeClay(dome, false)
    expect(dome.material).toBe(domeOrig)
  })
})

describe('Clay light and normals', () => {
  it('the key defaults to camera right, in front and above (the render guide), and turns about the view axis', () => {
    const k = clayKey(0)
    const b = CLAY_KEY_BASE
    const len = Math.hypot(...b)
    expect([k.x, k.y, k.z].map((v) => +v.toFixed(3))).toEqual(b.map((v) => +(v / len).toFixed(3)))
    const back = clayKey(180)
    expect(back.x).toBeCloseTo(-k.x, 5)
    expect(back.y).toBeCloseTo(k.y, 5)
    setClayYaw(90)
    expect(clayKeyUniform.value.z).toBeCloseTo(-k.x, 5)
    setClayYaw(0)
  })

  it('smoothing flattens a noisy surface toward its large shape and keeps a flat one flat', () => {
    const n = 12
    const pos: number[] = []
    const idx: number[] = []
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) pos.push(x, y, -10 + (((x * 7 + y * 13) % 5) - 2) * 0.4)
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
      const a = y * n + x
      idx.push(a, a + 1, a + n, a + 1, a + n + 1, a + n)
    }
    const facing = (s: Float32Array) => { let t = 0; for (let i = 0; i < s.length; i += 3) t += Math.abs(s[i + 2]); return t / (s.length / 3) }
    expect(facing(smoothedNormals(pos, idx, 6))).toBeGreaterThan(facing(smoothedNormals(pos, idx, 0)))
    const plane = pos.map((v, i) => (i % 3 === 2 ? -10 : v))
    expect(Math.abs(smoothedNormals(plane, idx, 4)[2])).toBeCloseTo(1, 5)
  })
})
