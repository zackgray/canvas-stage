// The car as a scene object: a body (the E24 stage-ready mesh, or a placeholder box until / unless it loads) and a
// soft contact shadow on the ground (E24b: the shadow under the sills is what grounds it). Posed on the ground plane
// from a CarPose: +X forward along the heading, +Y the plane normal, wheels on the plane.
import {
  BoxGeometry, DataTexture, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Vector3,
  type Object3D,
} from 'three'
import type { V3 } from './geom'
import type { CarPose } from './path'
import { objectFrame } from './track'

/** Length (forward), height, width in metres: the E24 car's measured size. */
export const CAR_BOX: V3 = [4.5, 1.47, 2.0]
const SHADOW_MARGIN = 0.45
const SHADOW_OPACITY = 0.7

/** A placeholder: a body box and a darker cabin, front to +X (visibly a car stand-in, not the asset). */
export function placeholderBody(size: V3 = CAR_BOX): Object3D {
  const g = new Group()
  g.name = 'car-placeholder'
  const [L, H, W] = size
  const body = new Mesh(new BoxGeometry(L, H * 0.5, W), new MeshStandardMaterial({ color: 0xb8402f, roughness: 0.5 }))
  body.position.y = H * 0.25 + 0.12
  const cabin = new Mesh(new BoxGeometry(L * 0.5, H * 0.4, W * 0.9), new MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.3 }))
  cabin.position.set(-L * 0.05, H * 0.7, 0)
  g.add(body, cabin)
  return g
}

/** Soft rounded-rectangle falloff: black with alpha, 1 in the middle fading to 0 at the edge. */
function shadowTexture(w = 64, h = 32): DataTexture {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = Math.abs((x + 0.5) / w - 0.5) * 2, v = Math.abs((y + 0.5) / h - 0.5) * 2
    const e = Math.max(0, 1 - Math.hypot(Math.max(0, u - 0.6) / 0.4, Math.max(0, v - 0.45) / 0.55))
    data[(y * w + x) * 4 + 3] = Math.round(255 * e * e * (3 - 2 * e))
  }
  const t = new DataTexture(data, w, h)
  t.needsUpdate = true
  return t
}

const ZERO = new Matrix4().makeScale(0, 0, 0)

/** The contact shadow: colour renders only. A depth render (override material) collapses it, so guides never see it. */
function contactShadow(size: V3): Mesh {
  const mat = new MeshBasicMaterial({ color: 0x000000, map: shadowTexture(), transparent: true, opacity: SHADOW_OPACITY, depthWrite: false })
  mat.polygonOffset = true
  mat.polygonOffsetFactor = -2
  const m = new Mesh(new PlaneGeometry(size[0] + 2 * SHADOW_MARGIN, size[2] + 2 * SHADOW_MARGIN), mat)
  m.name = 'car-shadow'
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.01
  const keep = new Matrix4()
  m.onBeforeRender = (_r, scene) => {
    if (!scene.overrideMaterial) return
    keep.copy(m.matrixWorld)
    m.matrixWorld.copy(ZERO)
  }
  m.onAfterRender = (_r, scene) => { if (scene.overrideMaterial) m.matrixWorld.copy(keep) }
  return m
}

export class Car {
  readonly root = new Group()
  size: V3 = CAR_BOX
  body: Object3D
  readonly shadow: Mesh
  /** what the body is: the asset's name, or why it is the placeholder */
  bodyNote = 'placeholder box (loading the car mesh…)'

  constructor() {
    this.root.name = 'world-car'
    this.body = placeholderBody()
    this.shadow = contactShadow(this.size)
    this.root.add(this.body, this.shadow)
  }

  /** Swap the body (the loaded asset); `size` is its box. */
  setBody(body: Object3D, size: V3, note: string) {
    this.root.remove(this.body)
    dispose(this.body)
    this.body = body
    this.size = size
    this.bodyNote = note
    this.shadow.scale.set((size[0] + 2 * SHADOW_MARGIN) / (CAR_BOX[0] + 2 * SHADOW_MARGIN), (size[2] + 2 * SHADOW_MARGIN) / (CAR_BOX[2] + 2 * SHADOW_MARGIN), 1)
    this.root.add(body)
  }

  /** Stand the car at the pose on a ground with normal `up`. */
  place(pose: CarPose, up: V3) {
    const { x, y, z } = objectFrame(pose.heading, up)
    const m = new Matrix4().makeBasis(new Vector3(...x), new Vector3(...y), new Vector3(...z))
    this.root.quaternion.setFromRotationMatrix(m)
    this.root.position.set(...pose.position)
    this.root.updateMatrixWorld(true)
  }

  dispose() {
    dispose(this.root)
    this.root.removeFromParent()
  }
}

function dispose(o: Object3D) {
  o.traverse((c) => {
    const m = c as Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    for (const mat of [m.material].flat()) {
      ;(mat as MeshBasicMaterial).map?.dispose()
      mat.dispose()
    }
  })
}
