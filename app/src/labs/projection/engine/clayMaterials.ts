// The clay materials (preview only): the performer's neutral grey shaded from its smoothed geometry, and the surround's
// far mesh and sky dome as luma. Each is built when the Clay look swaps it in and freed when it swaps out.
import { BufferAttribute, DoubleSide, ShaderMaterial, type BufferGeometry, type Material, type Mesh } from 'three'
import { clayKeyUniform } from './clay'
import { smoothedNormals } from './clayNormals'
import { CLAY_FAR_FRAG, CLAY_SKY_FRAG } from './clayShader'
import { swapClay, unswapClay } from './claySwap'

const PERFORMER_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }`
// e96_clay.py: shade = 0.16 + 0.62 key + 0.10 fill (fill = soft sky light, 0.5 + 0.5 n.y), person grey = 0.58 shade / 0.6
const PERFORMER_FRAG = /* glsl */ `
  uniform vec3 clayKey; varying vec3 vN; varying vec3 vView;
  void main() {
    vec3 n = normalize(vN);
    if (dot(n, vView) > 0.0) n = -n; // double-sided: face the camera
    float key = clamp(dot(n, normalize(clayKey)), 0.0, 1.0);
    float fill = 0.5 + 0.5 * n.y;
    float g = 0.58 * (0.16 + 0.62 * key + 0.10 * fill) / 0.6;
    gl_FragColor = vec4(vec3(pow(clamp(g, 0.0, 1.0), 2.2)), 1.0);
    #include <colorspace_fragment>
  }`

/** The performer's clay: one shared material for every frame mesh (it carries no per-mesh state). */
let performer: ShaderMaterial | null = null
const performerMaterial = () => performer ??= new ShaderMaterial({
  side: DoubleSide, uniforms: { clayKey: clayKeyUniform }, vertexShader: PERFORMER_VERT, fragmentShader: PERFORMER_FRAG,
})

/** Smoothed normals on the geometry, once (a cached frame mesh keeps them while it lives). */
function ensureNormals(geo: BufferGeometry) {
  if (geo.getAttribute('normal')) return
  const pos = geo.getAttribute('position')
  const idx = geo.getIndex()
  if (!pos || !idx) return
  geo.setAttribute('normal', new BufferAttribute(smoothedNormals(pos.array, idx.array), 3))
}

/** Show an actor frame mesh in clay (on) or with its own colour (off). */
export function setPerformerClay(mesh: Mesh, on: boolean) {
  if (!on) return unswapClay(mesh)
  ensureNormals(mesh.geometry)
  swapClay(mesh, () => performerMaterial(), true)
}

const shared = (orig: Material, names: string[]) => {
  const src = (orig as ShaderMaterial).uniforms
  return Object.fromEntries(names.map((k) => [k, src[k]]))
}

/** The surround's far mesh in clay: the same texture uniform (a hi-res swap reaches it), luma instead of colour. */
export function setFarClay(mesh: Mesh, on: boolean) {
  if (!on) return unswapClay(mesh)
  swapClay(mesh, (o) => new ShaderMaterial({
    side: DoubleSide, uniforms: shared(o, ['map']), vertexShader: (o as ShaderMaterial).vertexShader, fragmentShader: CLAY_FAR_FRAG,
  }))
}

/** The sky-only dome in clay: its own lookup, luma instead of colour. */
export function setDomeClay(mesh: Mesh, on: boolean) {
  if (!on) return unswapClay(mesh)
  swapClay(mesh, (o) => {
    const m = o as ShaderMaterial
    return new ShaderMaterial({
      side: m.side, depthWrite: false, uniforms: shared(o, ['sky', 'toLevel']), vertexShader: m.vertexShader, fragmentShader: CLAY_SKY_FRAG,
    })
  })
}
