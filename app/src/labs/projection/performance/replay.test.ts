// The actor layer replays the source camera exactly: decoded through real PNGs, every actor vertex lands on its own
// pixel centre at that pixel's depth, and its texture coordinate reads that pixel's colour; the depth edge between
// the arm and the torso is cut, so no triangle stretches across it off-axis.
import { describe, expect, it } from 'vitest'
import { projectPoint, toRad } from '../math/camera'
import { encodePng } from '../math/png'
import { ACTOR_EDGE, actorGeometry } from './actorMesh'
import { decodeActorFrame } from './decode'
import { actorAt, MPU, syntheticFrame, syntheticPack } from './__fixtures__/syntheticPack'

const pack = syntheticPack()
const full = { width: pack.width, height: pack.height, vfovDeg: pack.source.vfovDeg }

async function decoded(i: number) {
  const f = syntheticFrame(pack, i)
  return decodeActorFrame(i, await encodePng(f.color), await encodePng(f.depth), await encodePng(f.mask), MPU)
}

describe('decoding a frame', () => {
  it('crops to the actors (+1 px), depth in metres, 0 off the actors', async () => {
    const c = await decoded(3)
    const ox = 20 + 3 * 8
    expect([c.x0, c.y0]).toEqual([ox - 1, 29])
    expect([c.w, c.h]).toEqual([42 + 2, 45 + 2])
    expect(c.depth[0]).toBe(0) // the 1 px border
    const inside = (40 - c.y0) * c.w + (ox + 5 - c.x0)
    expect(c.depth[inside] * c.metersPerUnit).toBeCloseTo(actorAt(pack, 3, ox + 5, 40).depth, 3)
    expect(c.rgba.length).toBe(c.w * c.h * 4)
  })

  it('a frame with no actors is empty and meshes to nothing', async () => {
    const off = syntheticPack({ width: 160 })
    const f = syntheticFrame(off, 40) // slid out of frame
    const c = await decodeActorFrame(40, await encodePng(f.color), await encodePng(f.depth), await encodePng(f.mask), MPU)
    expect(c.w).toBe(0)
    expect(actorGeometry(c, full).triangles).toBe(0)
  })
})

describe('the actor mesh from the source camera', () => {
  it('every vertex sits on its pixel centre at its depth, and samples that pixel\'s colour', async () => {
    const c = await decoded(5)
    const g = actorGeometry(c, full)
    expect(g.triangles).toBeGreaterThan(1000)
    const k = { width: pack.width, height: pack.height, vfov: toRad(pack.source.vfovDeg) }
    let worst = 0
    for (let v = 0; v < g.positions.length / 3; v++) {
      const [px, py, d] = projectPoint(k, g.positions[v * 3], g.positions[v * 3 + 1], g.positions[v * 3 + 2])
      const x = Math.round(px - 0.5), y = Math.round(py - 0.5)
      worst = Math.max(worst, Math.abs(px - 0.5 - x), Math.abs(py - 0.5 - y))
      const truth = actorAt(pack, 5, x, y)
      expect(truth.part).not.toBeNull()
      expect(d).toBeCloseTo(truth.depth, 3)
      // uv -> crop texel (bottom-left origin) -> the crop's rgba (top row first) = the pack's pixel
      const tx = Math.floor(g.uvs[v * 2] * c.w), ty = c.h - 1 - Math.floor(g.uvs[v * 2 + 1] * c.h)
      expect([tx + c.x0, ty + c.y0]).toEqual([x, y])
      expect([...c.rgba.subarray((ty * c.w + tx) * 4, (ty * c.w + tx) * 4 + 3)]).toEqual(truth.rgb)
    }
    expect(worst).toBeLessThan(1e-3)
  })

  it('covers every actor pixel centre that has actor neighbours (no gaps from the source camera)', async () => {
    const c = await decoded(2)
    const g = actorGeometry(c, full)
    const k = { width: pack.width, height: pack.height, vfov: toRad(pack.source.vfovDeg) }
    const hit = new Set<number>()
    for (let v = 0; v < g.positions.length / 3; v++) {
      const [px, py] = projectPoint(k, g.positions[v * 3], g.positions[v * 3 + 1], g.positions[v * 3 + 2])
      hit.add(Math.round(py - 0.5) * pack.width + Math.round(px - 0.5))
    }
    let actors = 0
    for (let y = 0; y < pack.height; y++) for (let x = 0; x < pack.width; x++) if (actorAt(pack, 2, x, y).part) actors++
    expect(hit.size).toBe(actors)
  })

  it('cuts at the arm / torso depth edge: no triangle spans more than the edge threshold', async () => {
    const g = actorGeometry(await decoded(4), full)
    let spans = 0
    for (let t = 0; t < g.indices.length; t += 3) {
      const z = [0, 1, 2].map((j) => -g.positions[g.indices[t + j] * 3 + 2])
      if (Math.max(...z) / Math.min(...z) - 1 > ACTOR_EDGE) spans++
    }
    expect(spans).toBe(0)
  })
})
