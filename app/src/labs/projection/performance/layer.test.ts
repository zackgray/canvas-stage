// The performance on the world clock: the World poses it for every time it shows (live frames and World.at captures),
// the clock runs as long as the longer of it and the car, and only a few frames' meshes are kept.
import { Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { World } from '../world/World'
import { cropActors, type ActorCrop } from './decode'
import { MESH_CACHE, PerformanceLayer } from './PerformanceLayer'
import { MPU, syntheticFrame, syntheticPack } from './__fixtures__/syntheticPack'

function layerOf(over = {}) {
  const pack = syntheticPack(over)
  const crops: ActorCrop[] = Array.from({ length: pack.frames }, (_, i) => {
    const f = syntheticFrame(pack, i)
    return cropActors(i, f.color, f.depth, f.mask, MPU)
  })
  return new PerformanceLayer(pack, crops)
}

const shownMesh = (l: PerformanceLayer) => l.camera.children.find((c): c is Mesh => c instanceof Mesh) ?? null

describe('the performance layer on the world clock', () => {
  it('shows frame round(t·fps) as the clock runs, and (Loop off) holds the last frame after the end', () => {
    const world = new World(async () => ({ missing: 'test' }))
    world.clock.loop = false
    const l = layerOf() // 12 frames @ 12 fps
    world.setPerformance(l)
    expect(l.current).toBe(0)
    world.clock.toggle()
    world.frame(0.5)
    expect(l.current).toBe(6)
    world.frame(0.24)
    expect(l.current).toBe(9) // 0.74 s -> 8.88
    world.frame(5)
    expect(world.clock.time).toBe(1) // the clock stops at the performance's end (frames / fps)
    expect(l.current).toBe(11)
    expect(shownMesh(l)?.name).toBe('performance-frame-11')
  })

  it('Loop (the default): the last frame shows for its frame, then the clock wraps to frame 0 and plays on', () => {
    const world = new World(async () => ({ missing: 'test' }))
    const l = layerOf() // 12 frames @ 12 fps: the clock is 1 s
    world.setPerformance(l)
    world.clock.seek(0.9)
    world.clock.toggle()
    world.frame(0.05) // 0.95 s -> 11.4
    expect(l.current).toBe(11)
    world.frame(0.1) // 1.05 s wraps to 0.05 s -> 0.6
    expect(world.clock.playing).toBe(true)
    expect(world.clock.time).toBeCloseTo(0.05, 9)
    expect(l.current).toBe(1)
    expect(shownMesh(l)?.name).toBe('performance-frame-1')
  })

  it('a capture at world time t shows that frame, and the live frame comes back after it', () => {
    const world = new World(async () => ({ missing: 'test' }))
    const l = layerOf()
    world.setPerformance(l)
    world.clock.seek(0.25)
    world.frame(0)
    expect(l.current).toBe(3)
    const inside = world.at(7 / 12, () => l.current)
    expect(inside).toBe(7)
    expect(l.current).toBe(3)
  })

  it('the clock lasts as long as the performance; off again, it is back to the default', () => {
    const world = new World(async () => ({ missing: 'test' }))
    const base = world.clock.duration
    const l = layerOf({ frames: 120, fps: 10 }) // 12 s, longer than the default 10 s
    world.setPerformance(l)
    expect(world.clock.duration).toBe(12)
    expect(world.group.children).toContain(l.object)
    world.setPerformance(null)
    expect(world.clock.duration).toBe(base)
    expect(world.group.children).not.toContain(l.object)
  })

  it('the actor mesh is a child of the pack\'s source camera at its pose', () => {
    const l = layerOf()
    l.show(0)
    expect(l.camera.position.toArray()).toEqual(l.pack.source.position)
    expect(l.camera.quaternion.toArray().map((v) => +v.toFixed(6))).toEqual(l.pack.source.quaternion.map((v) => +v.toFixed(6)))
    expect(l.camera.fov).toBe(40)
    expect(shownMesh(l)).not.toBeNull()
  })

  it('keeps at most MESH_CACHE meshes built; a cached frame is not rebuilt', () => {
    const l = layerOf({ frames: 18 }) // the figure is in frame for all 18
    for (let i = 0; i < 18; i++) l.show(i)
    let s = l.stats()
    expect(s.meshes).toBe(MESH_CACHE)
    expect(s.buildMs.count).toBe(18)
    l.show(16)
    expect(l.stats().buildMs.count).toBe(18)
    l.show(0)
    s = l.stats()
    expect(s.buildMs.count).toBe(19)
    expect(s.cpuBytes).toBeGreaterThan(0)
    expect(s.textureBytes).toBeGreaterThan(0)
    l.dispose()
    expect(l.stats().meshes).toBe(0)
  })

  it('refuses a pack whose decoded frames do not match its manifest', () => {
    const pack = syntheticPack()
    expect(() => new PerformanceLayer(pack, [])).toThrow(/0 frames decoded/)
  })
})
