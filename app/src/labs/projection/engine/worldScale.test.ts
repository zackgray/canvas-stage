// The world root scale's rules and its reach: which worlds scale, the lens correction, the root on the set / surround /
// performance, the ground match keeping the projector's view, and the readouts (orbit floor, rig height, view distance) in
// true metres afterwards.
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { OrbitRig } from '../../controller/rigs/orbitRig'
import { buildGrid } from '../math/grid'
import { footprintWeight, matchGround, reachWeight, type FloorPlane } from './groundMatch'
import { floorAlongUp, type LevelFile } from './level'
import { SurroundLayer } from './surround'
import { lensVfovOf, levelForLens, worldScaleOf } from './worldScale'
import { scaledLevel, setFloorOf } from './worldScaleFetch'
import { WorldRoot } from './worldRoot'
import { PROJECTOR_POSITION, PROJECTOR_TARGET } from './stageScene'

const level = (o: Partial<LevelFile> = {}): LevelFile => ({ up: [0, 1, 0], cameraHeightM: 2.5, method: 'floor-ransac', ...o })
const world = (eyeHeightM?: number) => ({ world: eyeHeightM === undefined ? {} : { eyeHeightM }, lens: { vfovDeg: 50 } })

function projector() {
  const p = new PerspectiveCamera(50, 16 / 9, 0.02, 2000)
  p.position.copy(PROJECTOR_POSITION)
  p.lookAt(PROJECTOR_TARGET)
  p.updateMatrixWorld(true)
  return p
}

describe('which worlds scale', () => {
  it('s = eyeHeightM / cameraHeightM on a built world with a fitted floor', () => {
    expect(worldScaleOf(world(1.6), level(), 50).s).toBeCloseTo(0.64, 9)
    expect(worldScaleOf(world(1.2), level(), 50).s).toBeCloseTo(0.48, 9)
    expect(worldScaleOf(world(), level(), 50).s).toBeCloseTo(0.64, 9) // a world block without a height: the eye preset
  })

  it('s = 1 (today\'s behaviour) without a world block, without a floor, with an assumed level or an absurd one', () => {
    expect(worldScaleOf({ lens: { vfovDeg: 50 } }, level(), 50).s).toBe(1)
    expect(worldScaleOf(null, level(), 50).s).toBe(1)
    expect(worldScaleOf(world(1.6), null, 50).s).toBe(1)
    expect(worldScaleOf(world(1.6), level({ method: 'assumed' }), 50).s).toBe(1)
    expect(worldScaleOf(world(1.6), level({ cameraHeightM: null }), 50).s).toBe(1)
    expect(worldScaleOf(world(1.6), level({ cameraHeightM: 1000 }), 50).s).toBe(1)
  })

  it('the lens correction is exact: a floor fitted through a wider lens is re-expressed at the set\'s', () => {
    // a floor 2 below a camera pitched down: sample it through a 60° lens, then read the same depths at 50°
    const n = new Vector3(0, 0.98, 0.2).normalize()
    const lv = levelForLens(level({ up: [n.x, n.y, n.z], cameraHeightM: 2, vfovDeg: 60 }), 50)
    const r = Math.tan((25 * Math.PI) / 180) / Math.tan((30 * Math.PI) / 180)
    for (const [x, y] of [[0.3, -0.4], [-0.2, -0.6], [0.5, -0.3]]) {
      const d = 2 / -n.dot(new Vector3(x, y, -1)) // planar depth of the floor at image point (x, y) through the 60° lens
      const p = new Vector3(x * d * r, y * d * r, -d) // the same pixel and depth through the 50° lens
      expect(new Vector3(...lv.up).dot(p) + lv.cameraHeightM!).toBeCloseTo(0, 9)
    }
    expect(levelForLens(level({ vfovDeg: 50 }), 50)).toEqual(level({ vfovDeg: 50 }))
    expect(levelForLens(level(), 50)).toEqual(level()) // no vfov in the file: unchanged
    expect(lensVfovOf({ lens: { vfovDeg: 56.61 } })).toBe(56.61)
    expect(lensVfovOf({})).toBeNull()
  })
})

describe('the root', () => {
  it('scales the set about the projector (the master view does not move) and places a performance on it', () => {
    const p = projector()
    const root = new WorldRoot(p)
    const pt = new Mesh(new BufferGeometry(), new MeshBasicMaterial())
    pt.position.set(0.3, -1, -5) // projector camera space
    root.set.add(pt)
    root.s = 0.5
    const w = pt.getWorldPosition(new Vector3())
    const along = w.clone().sub(p.position)
    expect(along.length()).toBeCloseTo(0.5 * Math.hypot(0.3, 1, 5), 6)
    // same ray from the projector
    expect(along.normalize().dot(new Vector3(0.3, -1, -5).normalize().applyQuaternion(p.quaternion))).toBeCloseTo(1, 9)
    const perf = new Group()
    root.place(perf)
    const x = new Vector3(1, 0, -4)
    expect(perf.localToWorld(x.clone()).sub(p.position).toArray()).toEqual(x.clone().sub(p.position).multiplyScalar(0.5).toArray().map((v) => expect.closeTo(v, 9)))
    root.s = NaN
    expect(root.s).toBe(1)
  })

  it('the orbit floor clamp, the rig and a distance along the view read true metres on a scaled set', () => {
    const p = projector()
    const ws = worldScaleOf(world(1.6), level({ up: [0, 1, 0], cameraHeightM: 2.5 }), null)
    const root = new WorldRoot(p)
    root.s = ws.s
    const lv = scaledLevel(ws, p)!
    // the floor sits exactly the camera height under the projector
    expect(lv.up.dot(p.position) - floorAlongUp(lv)).toBeCloseTo(1.6, 9)
    const rig = new OrbitRig()
    rig.level = () => lv
    rig.target.set(0, 0, -5)
    rig.retarget(p.position)
    expect((rig as unknown as { floor: number }).floor).toBeCloseTo(floorAlongUp(lv), 9)
    expect((rig as unknown as { height: number }).height - floorAlongUp(lv)).toBeCloseTo(1.6, 9) // rig height over the floor, metres
    // a wall 10 set units ahead is 10·s metres away when looked at
    const grid = buildGrid({ width: 8, height: 6, vfov: (50 * Math.PI) / 180 }, new Float32Array(48).fill(10), { step: 1, edgeThreshold: 0.04, planeAware: true })
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(grid.positions, 3))
    g.setIndex(new BufferAttribute(grid.indices, 1))
    const wall = new Mesh(g, new MeshBasicMaterial())
    root.set.add(wall)
    const scene = new Scene().add(p)
    scene.updateMatrixWorld(true)
    const view = p.clone()
    const ray = new Raycaster()
    ray.setFromCamera(new Vector2(0, 0), view)
    const hit = ray.intersectObject(wall)[0]
    view.updateMatrixWorld(true)
    expect(-hit.point.clone().applyMatrix4(view.matrixWorldInverse).z).toBeCloseTo(10 * ws.s, 6) // planar distance along the view axis
  })
})

describe('the surround on the root', () => {
  const up: FloorPlane['up'] = [0, 1, 0]
  it('draws at the root scale, and with no fitted surround floor the far mesh is exactly as built (old worlds)', () => {
    const p = projector()
    const layer = new SurroundLayer(p)
    const W = 64, H = 32
    const dist = Float32Array.from({ length: W * H }, (_, i) => (Math.floor(i / W) >= H / 2 ? 6 : 0))
    layer.setData({ meta: { url: '', distUrl: '', width: W, height: H, distMetersPerUnit: 1, up: [0, 1, 0], levelMethod: 'floor-ransac', interior: false, batch: '', seed: 1, prompt: '', scaleToStill: 1, residualMedianPct: 0, skyShare: 0, pickedAt: '' }, rgb: new Uint8Array(W * H * 3), channels: 3, dist })
    const before = Float32Array.from(layer.far!.geometry.getAttribute('position').array as Float32Array)
    layer.setSetFloor({ up, h: 2 })
    expect(layer.groundMatched).toBe(false)
    expect(Array.from(layer.far!.geometry.getAttribute('position').array as Float32Array)).toEqual(Array.from(before))
    layer.rootScale = 0.5
    layer.prepare(p, new Scene())
    const m = layer.far!.matrixWorld.elements
    expect(Math.hypot(m[0], m[1], m[2])).toBeCloseTo(0.5, 9)
  })

  it('the ground match moves every vertex along its own ray (the projector sees the same picture)', () => {
    // a 9 x 5 grid: a tilted ground 3 down below, a wall 6 away above
    const cols = 9, rows = 5
    const pos = new Float32Array(cols * rows * 3)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lon = (c / (cols - 1) - 0.5) * 2 * Math.PI, lat = (0.5 - r / (rows - 1)) * Math.PI * 0.9
      const d = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), -Math.cos(lat) * Math.cos(lon)]
      const t = d[1] < -0.05 ? 3 / -d[1] : 6
      pos.set(d.map((x) => x * t), (r * cols + c) * 3)
    }
    const out = matchGround(pos, cols, rows, { up, h: 2 }, up, { tx: 0.5, ty: 0.3 })
    for (let i = 0; i < pos.length; i += 3) {
      const a = new Vector3(pos[i], pos[i + 1], pos[i + 2]), b = new Vector3(out[i], out[i + 1], out[i + 2])
      if (a.lengthSq() === 0) continue
      expect(a.normalize().dot(b.normalize())).toBeCloseTo(1, 9)
    }
    expect(reachWeight([0, -1, 0], { up, h: 2 })).toBe(1)
    expect(reachWeight([0, 0.1, -1], { up, h: 2 })).toBe(0)
    expect(footprintWeight([0, 0, -1], { tx: 0.5, ty: 0.3 })).toBe(1)
    expect(footprintWeight([0, 0, 1], { tx: 0.5, ty: 0.3 })).toBe(0)
  })

  it('the set floor from a world scale is the lens-corrected level, in set units', () => {
    const ws = worldScaleOf(world(1.6), level({ cameraHeightM: 2.5 }), 50)
    expect(setFloorOf(ws)).toEqual({ up: [0, 1, 0], h: 2.5 })
    expect(setFloorOf(worldScaleOf(world(1.6), null, 50))).toBeNull()
  })
})
