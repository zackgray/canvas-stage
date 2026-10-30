// The Performance orbit pivot: one point per clip (the per-axis median of the frames' actor centres), in world space
// through the source camera; the frame on show never moves it.
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { World } from '../world/World'
import { actorCentre, frameCentre } from './actorCentre'
import { cropActors, type ActorCrop } from './decode'
import { PerformanceLayer } from './PerformanceLayer'
import { MPU, syntheticFrame, syntheticPack } from './__fixtures__/syntheticPack'

const pack = syntheticPack()
const full = { width: pack.width, height: pack.height, vfovDeg: pack.source.vfovDeg }
const crops = (): ActorCrop[] => Array.from({ length: pack.frames }, (_, i) => {
  const f = syntheticFrame(pack, i)
  return cropActors(i, f.color, f.depth, f.mask, MPU)
})

describe('the performance pivot', () => {
  it("a frame's centre is its actors' mean point: in front of the camera at the figure's depth", () => {
    const c = frameCentre(crops()[0], full)!
    expect(c.z).toBeLessThan(-4.4)
    expect(c.z).toBeGreaterThan(-5.3)
    // frame 0's figure is left of centre (x 20-62 of 160 px)
    expect(c.x).toBeLessThan(0)
  })

  it("the clip's centre is the per-axis median of the frame centres (the figure slides; the pivot does not)", () => {
    const cs = crops()
    const per = cs.map((c) => frameCentre(c, full)!)
    const centre = actorCentre(cs, full)!
    const xs = per.map((p) => p.x).sort((a, b) => a - b)
    expect(centre.x).toBeCloseTo((xs[5] + xs[6]) / 2, 9)
    expect(centre.x).toBeGreaterThan(xs[0])
    expect(centre.x).toBeLessThan(xs[11])
  })

  it('frames without actors are skipped and one wild frame cannot drag it', () => {
    const cs = crops()
    const base = actorCentre(cs, full)!
    const empty = { ...cs[3], w: 0, h: 0, depth: new Uint16Array(0) }
    const far = { ...cs[4], depth: cs[4].depth.map((d) => (d ? d * 6 : 0)) } // one frame 6× deeper
    const moved = actorCentre([...cs.slice(0, 3), empty, far, ...cs.slice(5)], full)!
    expect(moved.distanceTo(base)).toBeLessThan(0.3)
    expect(actorCentre([empty], full)).toBeNull()
  })

  it('the layer gives it in world space, the same whatever frame is showing', () => {
    const world = new World(async () => ({ missing: 'test' }))
    const layer = new PerformanceLayer(pack, crops())
    world.setPerformance(layer)
    const at0 = layer.pivot()!
    world.clock.toggle()
    world.frame(0.6)
    expect(layer.current).toBeGreaterThan(5)
    expect(layer.pivot()!.distanceTo(at0)).toBe(0)
    // the source camera stands at (0, 1.6, 0) looking down -Z and a little down: the actors are ~5 m ahead, below eye height
    const cam = new Vector3(...pack.source.position)
    expect(at0.distanceTo(cam)).toBeGreaterThan(4.4)
    expect(at0.distanceTo(cam)).toBeLessThan(5.5)
    expect(at0.z).toBeLessThan(-4)
    expect(at0.y).toBeLessThan(1.6)
    expect(world.performance?.pivot?.()?.equals(at0)).toBe(true)
  })
})
