// The Surround far layer without WebGL: the real meshes are ray-cast, and the real `layered` call order is replayed through a
// software painter (colour goes to the nearest hit since the last depth clear), so "the set wins" is a property of the
// order surround.ts really issues, not of a copy of it.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Raycaster, Scene, Vector2 } from 'three'
import { describe, expect, it } from 'vitest'
import { assumedUp, levelBasis, toCam } from '../../../../server/surround/equirect.ts'
import { PANO_H, PANO_W, type SurroundMeta } from '../../../../server/surround/types.ts'
import { buildGrid } from '../math/grid'
import { captureLayer, layered, SurroundLayer, withSurroundCapture, type DrawTarget } from './surround'
import { buildDomeTexture, buildFarGeometry } from './surroundMesh'

const W = 128, H = 64 // a small canvas for the suite (the app's is 2048 x 1024)
const meta = (o: Partial<SurroundMeta> = {}): SurroundMeta => ({
  url: '/s.png', distUrl: '/d.png', width: W, height: H, distMetersPerUnit: 0.01, up: assumedUp(), levelMethod: 'assumed', interior: false,
  batch: 'b', seed: 1, prompt: '', scaleToStill: 1, residualMedianPct: 0, skyShare: 0, pickedAt: 't', ...o,
})
/** below the horizon: a ground ring at `ring` m; above it: sky (0) */
const outdoors = (ring: number) => Float32Array.from({ length: W * H }, (_, i) => (Math.floor(i / W) >= H / 2 ? ring : 0))
const grey = () => new Uint8Array(W * H * 3).fill(120)

function projector() {
  const p = new PerspectiveCamera(40, 16 / 9, 0.02, 2000) // the stage's projector pose
  p.position.set(0, 1.6, 0)
  p.lookAt(0, 1, -8)
  p.updateMatrixWorld(true)
  return p
}

/** the still's set: a flat wall 5 m ahead of the projector, 40 deg lens, as a displaced grid child of the projector */
function setMesh(p: PerspectiveCamera, depthM = 5) {
  const [w, h] = [32, 18]
  const grid = buildGrid({ width: w, height: h, vfov: (40 * Math.PI) / 180 }, new Float32Array(w * h).fill(depthM), { step: 1, edgeThreshold: 0.04, planeAware: true })
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(grid.positions, 3))
  g.setIndex(new BufferAttribute(grid.indices, 1))
  const m = new Mesh(g, new MeshBasicMaterial({ side: DoubleSide }))
  p.add(m)
  return m
}

function cameraAt(p: PerspectiveCamera, yawDeg: number, vfov = 50) {
  const cam = new PerspectiveCamera(vfov, 16 / 9, 0.02, 2000)
  cam.position.copy(p.position)
  const a = (yawDeg * Math.PI) / 180
  cam.lookAt(p.position.x + Math.sin(a) * -8 * -1, 1.6, p.position.z - Math.cos(a) * 8) // yaw about world up from the projector's -Z
  cam.updateMatrixWorld(true)
  return cam
}

const N = [24, 14] as const
const raysOf = (cam: PerspectiveCamera) => {
  const out: Raycaster[] = []
  for (let j = 0; j < N[1]; j++) for (let i = 0; i < N[0]; i++) {
    const r = new Raycaster()
    r.setFromCamera(new Vector2(((i + 0.5) / N[0]) * 2 - 1, 1 - ((j + 0.5) / N[1]) * 2), cam)
    out.push(r)
  }
  return out
}
const hitOf = (scene: Object3D, r: Raycaster) => { const h = r.intersectObjects(scene.children, true); return h.length ? h[0].distance : null }

/** a renderer that only records what is asked of it, and a painter that replays it per ray */
function recorder(rays: Raycaster[], names: Map<Scene, string>) {
  const ops: string[] = []
  const color: (string | null)[] = rays.map(() => null)
  const depth: number[] = rays.map(() => Infinity)
  const t: DrawTarget = {
    autoClear: true,
    clear: () => { ops.push('clear'); color.fill(null); depth.fill(Infinity) },
    clearDepth: () => { ops.push('clearDepth'); depth.fill(Infinity) },
    render: (scene) => {
      const name = names.get(scene) ?? 'other'
      ops.push(`render:${name}`)
      rays.forEach((r, k) => { const d = hitOf(scene, r); if (d !== null && d < depth[k]) { depth[k] = d; color[k] = name } })
    },
  }
  return { t, ops, color }
}

function stageOf(interior = false, ring = 12) {
  const p = projector()
  const main = new Scene()
  main.add(p)
  const set = setMesh(p)
  const layer = new SurroundLayer(p)
  main.userData.surround = layer
  layer.setData({ meta: meta({ interior }), rgb: grey(), channels: 3, dist: interior ? new Float32Array(W * H).fill(ring) : outdoors(ring) })
  return { p, main, set, layer }
}

const holeShare = (color: (string | null)[]) => color.filter((c) => c === null).length / color.length
const names = (s: ReturnType<typeof stageOf>) => new Map<Scene, string>([[s.main, 'set'], [s.layer.scene, 'far']])
const frame = (s: ReturnType<typeof stageOf>, yaw: number, layerOn: boolean) => {
  const cam = cameraAt(s.p, yaw)
  s.main.updateMatrixWorld(true)
  const rays = raysOf(cam)
  const rec = recorder(rays, names(s))
  layered(rec.t, s.main, cam, layerOn ? s.layer : null, () => rec.t.render(s.main, cam), { clear: true })
  return rec
}

describe('the far layer closes the holes', () => {
  it('a view 135 deg off the still is all hole with the set alone and has none with the surround', () => {
    const s = stageOf()
    expect(holeShare(frame(s, 135, false).color)).toBe(1)
    const withLayer = frame(s, 135, true)
    expect(holeShare(withLayer.color)).toBe(0)
    expect(new Set(withLayer.color)).toEqual(new Set(['far']))
  })

  it('every yaw round the sphere is covered; sky comes from the dome, the ground from the far mesh', () => {
    const s = stageOf()
    for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) expect(holeShare(frame(s, yaw, true).color)).toBe(0)
    expect(s.layer.dome).not.toBeNull()
  })

  it('the set wins wherever it has geometry, even when the far mesh is nearer along that ray', () => {
    const s = stageOf(false, 3) // the ground ring at 3 m is in front of the 5 m wall for every ray that hits both
    const rec = frame(s, 0, true)
    const cam = cameraAt(s.p, 0)
    const rays = raysOf(cam)
    const nearFar = rays.filter((r) => { const a = hitOf(s.layer.scene, r), b = hitOf(s.main, r); return a !== null && b !== null && a < b })
    expect(nearFar.length).toBeGreaterThan(10) // the premise: far is in front of the set on those rays
    rays.forEach((r, k) => { if (hitOf(s.main, r) !== null) expect(rec.color[k]).toBe('set') })
    expect(rec.color.filter((c) => c === 'set').length).toBeGreaterThan(20)
  })

  it('draws far, clears depth, then the set (the order IS the guard)', () => {
    const s = stageOf()
    expect(frame(s, 0, true).ops).toEqual(['clear', 'render:far', 'clearDepth', 'render:set'])
  })
})

describe('interiors', () => {
  it('draw no sky dome and cut nothing: the far mesh covers every direction', () => {
    const s = stageOf(true)
    expect(s.layer.dome).toBeNull()
    expect(s.layer.far).not.toBeNull()
    expect(holeShare(frame(s, 135, true).color)).toBe(0)
  })

  it('an interior\'s far mesh keeps quads at big distance jumps and fills sky texels; an exterior cuts them', () => {
    const d = new Float32Array(W * H).fill(2)
    for (let y = 0; y < H; y++) for (let x = W / 2; x < W; x++) d[y * W + x] = 40 // a wall 20x further on the right half
    d.fill(0, 0, W * 4) // a few rows of sky at the top
    const out = buildFarGeometry(d, W, H, assumedUp(), { step: 2 })
    const inn = buildFarGeometry(d, W, H, assumedUp(), { step: 2, interior: true })
    expect(inn.index.length).toBe((inn.cols - 1) * (inn.rows - 1) * 6) // every quad
    expect(out.index.length).toBeLessThan(inn.index.length)
    let nearest = Infinity
    for (let i = 0; i < inn.position.length; i += 3) nearest = Math.min(nearest, Math.hypot(inn.position[i], inn.position[i + 1], inn.position[i + 2]))
    expect(nearest).toBeGreaterThan(1) // no vertex left at the origin: the sky texels took a real distance
  })
})

describe('geometry and textures', () => {
  it('the mesh vertex at the canvas centre is the still\'s levelled forward at its distance, level with the camera', () => {
    const d = new Float32Array(W * H).fill(7)
    const g = buildFarGeometry(d, W, H, assumedUp(), { step: 2 })
    const centre = (g.rows >> 1) * g.cols + (g.cols >> 1)
    const p = [g.position[centre * 3], g.position[centre * 3 + 1], g.position[centre * 3 + 2]]
    const f = toCam(levelBasis(assumedUp()), [0, 0, -7])
    for (let i = 0; i < 3; i++) expect(p[i]).toBeCloseTo(f[i], 4)
    const up = assumedUp()
    expect(p[0] * up[0] + p[1] * up[1] + p[2] * up[2]).toBeCloseTo(0, 4) // on the camera's level plane
  })

  it('the dome texture replaces objects above the horizon with the sky above them and leaves the ground', () => {
    const [w, h] = [4, 8]
    const rgb = new Uint8Array(w * h * 3)
    const dist = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { rgb[(y * w + x) * 3] = y * 10; dist[y * w + x] = y === 0 ? 0 : 5 } // row 0 sky, the rest objects
    const tex = buildDomeTexture(rgb, 3, dist, w, h)
    expect(tex[(2 * w) * 4]).toBe(0) // row 2 (object, above the horizon) now carries row 0's sky colour
    expect(tex[(6 * w) * 4]).toBe(60) // row 6 is below the horizon: untouched
    expect(PANO_W / PANO_H).toBe(2)
  })
})

describe('captures include the layer only when asked', () => {
  it('captureLayer is null outside captureOn, the layer inside it; a stage without a layer just runs', () => {
    const s = stageOf()
    expect(captureLayer(s.main)).toBeNull()
    withSurroundCapture({ surround: s.layer }, () => expect(captureLayer(s.main)).toBe(s.layer))
    expect(captureLayer(s.main)).toBeNull()
    expect(withSurroundCapture({}, () => 7)).toBe(7)
  })

  it('a capture draws far, depth clear, set with no screen clear, and puts the background and autoClear back', () => {
    const s = stageOf()
    s.main.background = new Color(0x123456)
    const cam = cameraAt(s.p, 0)
    const rec = recorder(raysOf(cam), names(s))
    layered(rec.t, s.main, cam, s.layer, () => rec.t.render(s.main, cam), { clear: false })
    expect(rec.ops).toEqual(['render:far', 'clearDepth', 'render:set'])
    expect((s.main.background as Color).getHex()).toBe(0x123456)
    expect(rec.t.autoClear).toBe(true)
    expect((s.layer.scene.background as Color).getHex()).toBe(0x123456) // the far scene drew it
  })

  it('an empty layer, or none, is a plain draw', () => {
    const p = projector()
    const main = new Scene()
    const rec = recorder([], new Map())
    layered(rec.t, main, p, new SurroundLayer(p), () => rec.t.render(main, p), { clear: true })
    layered(rec.t, main, p, null, () => rec.t.render(main, p), { clear: true })
    expect(rec.ops).toEqual(['render:other', 'render:other'])
  })
})
