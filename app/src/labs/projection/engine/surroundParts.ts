// The Surround layer's three.js parts: the far mesh (pano colour on the distance mesh) and the sky-only dome, their
// shaders and the dome's per-draw pose. SurroundLayer (surround.ts) owns them; the pure builders are in surroundMesh.ts.
import {
  BackSide, BufferAttribute, BufferGeometry, DataTexture, DoubleSide, LinearFilter, Matrix3, Matrix4, Mesh, RGBAFormat, ShaderMaterial,
  SphereGeometry, SRGBColorSpace, UnsignedByteType, type Camera, type Object3D, type PerspectiveCamera, type Texture,
} from 'three'
import { levelBasis } from '../../../../server/surround/equirect.ts'
import type { Vec3 } from '../../../../server/surround/types.ts'
import type { FarGeometry } from './surroundMesh'

const SKY_VERT = /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const SKY_FRAG = /* glsl */ `uniform sampler2D sky; uniform mat3 toLevel; varying vec3 vDir;
  void main() { vec3 n = normalize(toLevel * normalize(vDir));
    float lon = atan(n.x, -n.z); float lat = asin(clamp(n.y, -1.0, 1.0));
    gl_FragColor = texture2D(sky, vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927));
    #include <colorspace_fragment>
  }`
const MESH_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const MESH_FRAG = /* glsl */ `uniform sampler2D map; varying vec2 vUv;
  void main() { gl_FragColor = texture2D(map, vUv);
    #include <colorspace_fragment>
  }`

export function panoTexture(rgba: Uint8Array, w: number, h: number): DataTexture {
  const t = new DataTexture(rgba, w, h, RGBAFormat, UnsignedByteType)
  t.colorSpace = SRGBColorSpace
  t.magFilter = t.minFilter = LinearFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

/** The far mesh: `geo` (projector camera space) textured with the pano colour by its uv. */
export function farMesh(geo: FarGeometry, colour: Texture): Mesh {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(geo.position, 3))
  g.setAttribute('uv', new BufferAttribute(geo.uv, 2))
  g.setIndex(new BufferAttribute(geo.index, 1))
  const m = new Mesh(g, new ShaderMaterial({ side: DoubleSide, uniforms: { map: { value: colour } }, vertexShader: MESH_VERT, fragmentShader: MESH_FRAG }))
  m.frustumCulled = false
  return m
}

/** The far mesh's vertices moved (the ground match); the bounds are recomputed for picking. */
export function setFarPositions(mesh: Mesh, position: Float32Array) {
  mesh.geometry.setAttribute('position', new BufferAttribute(position, 3))
  mesh.geometry.computeBoundingSphere()
}

/** Swap the far mesh's colour (the hi-res texture, or back to the 2048 one). */
export function setFarColour(mesh: Mesh, colour: Texture) {
  (mesh.material as ShaderMaterial).uniforms.map.value = colour
}

/** The sky-only dome: a unit sphere drawn first, never writing depth, sampled by direction in the level frame. */
export function domeMesh(sky: Texture): Mesh {
  const m = new Mesh(new SphereGeometry(1, 48, 24), new ShaderMaterial({
    side: BackSide, depthWrite: false, uniforms: { sky: { value: sky }, toLevel: { value: new Matrix3() } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
  }))
  m.renderOrder = -1
  m.frustumCulled = false
  return m
}

/** Centre the dome on the camera, inside its far plane, and point its lookup into the level frame `up` defines. */
export function poseDome(dome: Mesh, camera: Camera, projector: Object3D, up: Vec3) {
  camera.updateMatrixWorld(true)
  const cam = camera as PerspectiveCamera
  dome.position.setFromMatrixPosition(camera.matrixWorld)
  dome.scale.setScalar(Math.min(1500, (cam.far || 2000) * 0.75))
  dome.updateMatrixWorld(true)
  // level -> world = projector rotation * level basis; the shader needs world -> level (the transpose)
  const R = levelBasis(up)
  const lvl = new Matrix4().set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1)
  const toWorld = new Matrix4().extractRotation(projector.matrixWorld).multiply(lvl)
  ;(dome.material as ShaderMaterial).uniforms.toLevel.value.setFromMatrix4(toWorld).transpose()
}
