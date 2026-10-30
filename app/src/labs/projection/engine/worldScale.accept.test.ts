// A5 acceptance on the 766 fixture world (__fixtures__/world766.ts): the master camera stands the world's camera height
// over the set's floor, the surround's ground meets the set's, and the E78 pinned soldier stands a man's height, all through
// the real scale path (worldScaleOf -> WorldRoot / SurroundLayer / PerformanceLayer) in true metres.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { parsePerformance } from '../../../project/performance'
import { gridMesh } from './gridMesh'
import { buildFarGeometry, distanceMetres } from './surroundMesh'
import { matchGround, surroundFloorPlane, type FloorPlane } from './groundMatch'
import { levelForLens, worldScaleOf, lensVfovOf } from './worldScale'
import { parseLevelFile } from './level'
import { scaledLevel, setFloorOf } from './worldScaleFetch'
import { WorldRoot } from './worldRoot'
import { fitPlane, fixtureJson, fixturePng, projectorCamera, readFixture, setGrid } from './__fixtures__/world766'
import { cropActors } from '../performance/decode'
import { PerformanceLayer } from '../performance/PerformanceLayer'
import { readSurroundFloor } from '../../../shared/worldContract'

type Meta = { lens: { vfovDeg: number }; depth: { metersPerUnit: number }; world: Record<string, unknown>; surround: Record<string, unknown> & { up: [number, number, number]; width: number; height: number; distMetersPerUnit: number } }
const meta = fixtureJson<Meta>('meta.json')
const level = parseLevelFile(fixtureJson('level.json'))!
const chest = { ...meta, world: { ...meta.world, eyeHeightM: 1.2, cameraPreset: 'chest' } }

describe('the 766 world at its camera height', () => {
  it('level.json fitted at MoGe\'s 62.63° re-expressed at the set\'s 56.61° lens: the floor the set\'s mesh has', () => {
    const lv = levelForLens(level, lensVfovOf(meta))
    expect(level.cameraHeightM).toBeCloseTo(2.606, 3)
    expect(lv.cameraHeightM!).toBeCloseTo(2.307, 2)
  })

  it('master camera 1.60 m ±3 % above the set floor (a RANSAC fit on the scaled set mesh, as the level writer selects it)', async () => {
    const ws = worldScaleOf(meta, level, lensVfovOf(meta))
    const projector = projectorCamera(meta.lens.vfovDeg, 1920 / 1088)
    const root = new WorldRoot(projector)
    root.s = ws.s
    const grid = await setGrid(meta)
    const mesh = gridMesh(grid, new MeshBasicMaterial())
    root.set.add(mesh)
    projector.updateMatrixWorld(true)
    const up = scaledLevel(ws, projector)!.up
    const pos = mesh.geometry.getAttribute('position')
    const cam = projector.position
    // the floor the level writer looks for: the lower 45 % of the still, planar depth 0.3–25 (set units), 4 cm (set units)
    const pts: Vector3[] = []
    for (let i = Math.floor(grid.rows * 0.55) * grid.cols; i < pos.count; i += 3) {
      const z = -pos.getZ(i)
      if (!(z > 0.3 && z < 25)) continue
      pts.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld))
    }
    const fit = fitPlane(pts, () => 0.04 * ws.s, up)
    const height = fit.n.dot(cam) + fit.d
    console.info(`[A5] s = ${ws.s.toFixed(4)}; master camera ${height.toFixed(3)} m over the set floor (RANSAC ${(fit.inliers * 100).toFixed(0)} % inliers, tilt ${(Math.acos(fit.n.dot(up)) * 180 / Math.PI).toFixed(2)}°)`)
    expect(fit.inliers).toBeGreaterThan(0.3)
    expect(height).toBeGreaterThan(1.6 * 0.97)
    expect(height).toBeLessThan(1.6 * 1.03)
    // the orbit clamp's floor (the level the rigs read) sits the camera height below too
    const lv = scaledLevel(ws, projector)!
    expect(lv.up.dot(cam) - lv.up.dot(lv.floor!)).toBeCloseTo(1.6, 6)
  })
})

/** The surround far mesh as the layer builds it from the fixture's distance, optionally ground-matched. */
async function farMesh(set: FloorPlane | null): Promise<Mesh> {
  const png = await fixturePng('surround-dist.png')
  const s = meta.surround
  const geo = buildFarGeometry(distanceMetres(png.data, s.distMetersPerUnit), s.width, s.height, s.up, { interior: false })
  const sur = surroundFloorPlane(readSurroundFloor(meta)!, s.up)
  const ty = Math.tan((meta.lens.vfovDeg * Math.PI) / 360)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(set ? matchGround(geo.position, geo.cols, geo.rows, set, sur.up, { tx: ty * 1920 / 1088, ty }) : geo.position, 3))
  g.setIndex(new BufferAttribute(geo.index, 1))
  return new Mesh(g, new MeshBasicMaterial({ side: DoubleSide }))
}

/**
 * Gap (true m) between the surround's ground and the set's floor plane, per direction (camera-space horizontal, about the
 * set's up) and ground distance, over a ±4° fan of 9 rays aimed at the set-floor point. A ray counts as seeing ground when
 * its first hit faces up (within 30°); a cell is measured when at least 3 rays see ground, and its gap is their median
 * |height over the floor|. A cell where posts, walls or mounds stand in front of the ground is "occluded", not a gap.
 * `below` counts first hits more than 10 cm under the floor (a step down: the E78 failure).
 */
function gaps(far: Mesh, set: FloorPlane, s: number, dirs: Record<string, Vector3>, dists: number[]) {
  const scene = new Scene().add(far)
  scene.updateMatrixWorld(true)
  const up = new Vector3(...set.up)
  const out: Record<string, (number | null)[]> = {}
  let below = 0, rays = 0
  for (const [name, fwd] of Object.entries(dirs)) {
    const f = fwd.clone().addScaledVector(up, -fwd.dot(up)).normalize()
    out[name] = dists.map((dTrue) => {
      const g = dTrue / s // app units on the set floor
      const hs: number[] = []
      for (let yaw = -4; yaw <= 4; yaw++) {
        const dir = f.clone().applyAxisAngle(up, (yaw * Math.PI) / 180).multiplyScalar(g).addScaledVector(up, -set.h).normalize()
        const hit = new Raycaster(new Vector3(), dir, 0.01, 500).intersectObject(far)[0]
        rays++
        if (!hit?.face) continue
        const height = (up.dot(hit.point) + set.h) * s
        if (height < -0.1) below++
        if (Math.abs(hit.face.normal.dot(up)) > Math.cos(Math.PI / 6)) hs.push(Math.abs(height))
      }
      hs.sort((a, b) => a - b)
      return hs.length >= 3 ? hs[hs.length >> 1] : null
    })
  }
  return { cells: out, below, rays }
}

describe('the surround ground meets the set floor', () => {
  it('gap < 10 cm at 3–8 m in 4 directions after the match (and what it was before)', async () => {
    const ws = worldScaleOf(meta, level, lensVfovOf(meta))
    const set = setFloorOf(ws)!
    const dirs = { front: new Vector3(0, 0, -1), right: new Vector3(1, 0, 0), back: new Vector3(0, 0, 1), left: new Vector3(-1, 0, 0) }
    const dists = [3, 4, 5, 6, 7, 8]
    const before = gaps(await farMesh(null), set, ws.s, dirs, dists)
    const after = gaps(await farMesh(set), set, ws.s, dirs, dists)
    const fmt = (g: ReturnType<typeof gaps>) => Object.entries(g.cells).map(([k, v]) => `${k} ${v.map((x) => (x === null ? 'occ' : (x * 100).toFixed(0))).join('/')}`).join(' · ')
      + ` · ${g.below}/${g.rays} rays hit >10 cm under the floor`
    console.info(`[A5] ground gap cm at ${dists.join('/')} m — before: ${fmt(before)}`)
    console.info(`[A5] ground gap cm at ${dists.join('/')} m — after:  ${fmt(after)}`)
    for (const v of Object.values(after.cells)) {
      expect(v.filter((g) => g !== null).length).toBeGreaterThanOrEqual(2) // every direction shows its ground somewhere in 3–8 m
      for (const g of v) if (g !== null) expect(g).toBeLessThan(0.1)
    }
    expect(after.below).toBeLessThan(before.below)
  }, 60_000)
})

describe('the E78 pinned soldier on the chest-height world', () => {
  it('stands 1.6–1.9 m (head top over the world floor, frames 0–15, the pinned depth through the root)', async () => {
    const pack = parsePerformance(new TextDecoder().decode(readFixture('e78/manifest.json')))
    expect(pack.pin?.k).toBeCloseTo(1.431, 3) // pinned to the WORLD's floor (server/stage/pin.ts worldFloorOf)
    const ws = worldScaleOf(chest, level, lensVfovOf(meta))
    const projector = projectorCamera(pack.source.vfovDeg, pack.source.aspect)
    const root = new WorldRoot(projector)
    root.s = ws.s
    const frames = [0, 5, 10, 15]
    const blank = { width: pack.width, height: pack.height, channels: 3 as const, bitDepth: 8 as const, data: new Uint8Array(pack.width * pack.height * 3) }
    const crops = await Promise.all(Array.from({ length: pack.frames }, async (_, i) => {
      if (!frames.includes(i)) return { index: i, x0: 0, y0: 0, w: 0, h: 0, rgba: new Uint8Array(0), depth: new Uint16Array(0), metersPerUnit: pack.depth.metersPerUnit }
      const n = String(i).padStart(3, '0')
      return cropActors(i, blank, await fixturePng(`e78/frames/depth_${n}.png`), await fixturePng(`e78/frames/mask_${n}.png`), pack.depth.metersPerUnit)
    }))
    const layer = new PerformanceLayer(pack, crops, 2)
    new Scene().add(projector, layer.object)
    root.place(layer.object)
    const lv = scaledLevel(ws, projector)!
    const floorAt = lv.up.dot(lv.floor!)
    const heights = frames.map((i) => {
      layer.show(i)
      const m = layer.camera.children.find((c) => (c as Mesh).isMesh) as Mesh
      m.updateMatrixWorld(true)
      const pos = m.geometry.getAttribute('position')
      // the head's top on the body: the highest vertex within 0.5 m (true) of the actor's median distance, so a silhouette
      // vertex that took the background's depth (sheet-edge bleed, far behind him) is not his head
      const cam = layer.camera.getWorldPosition(new Vector3())
      const pts = Array.from({ length: pos.count }, (_, k) => new Vector3().fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld))
      const dist = pts.map((p) => p.distanceTo(cam)).sort((a, b) => a - b)
      const mid = dist[dist.length >> 1]
      let top = -Infinity, all = -Infinity
      for (const p of pts) {
        const h = lv.up.dot(p) - floorAt
        all = Math.max(all, h)
        if (Math.abs(p.distanceTo(cam) - mid) < 0.5) top = Math.max(top, h)
      }
      return top
    })
    const sorted = [...heights].sort((a, b) => a - b)
    const median = (sorted[1] + sorted[2]) / 2
    console.info(`[A5] E78 soldier at chest 1.2 m (s = ${ws.s.toFixed(4)}): head over the floor ${heights.map((h) => h.toFixed(2)).join(' / ')} m, median ${median.toFixed(2)} m`)
    // Plan gate 1.6–1.9 m. Pinned (E78) to its PLATE's floor (k 1.482) he read 1.91 m: the plate's fit and the world's
    // level are two estimates of one ground, ~5–7 % apart. The join made the pin measure against the world's floor (the one
    // this scale and Shoot's ground come from): k 1.431 from the real script on the full E78 lift.
    expect(median).toBeGreaterThanOrEqual(1.6)
    expect(median).toBeLessThanOrEqual(1.9)
  }, 30_000)
})
