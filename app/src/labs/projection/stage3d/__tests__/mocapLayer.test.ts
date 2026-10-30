// The 3D performer as a world-clock layer: deterministic poses, the holder WorldRoot places (the performer's own transform is never
// touched), the honest pack-shaped descriptor take lock reads, and its duration as the world clock's length and the take cap.
import { PerspectiveCamera } from 'three'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Performer3D } from '../../../../stage3d/contract'
import { WALK_TOWARD } from '../../../../stage3d/presets'
import { WorldRoot } from '../../engine/worldRoot'
import { STAGE_RIGS } from '../../operator/link'
import { StageOperatorEngine } from '../../operator/stageEngine'
import { ASPECT, FRAME } from '../../operator/testRig'
import { World } from '../../world/World'
import { kitPackEntry } from '../kitPerformance'
import { mocapPack, MocapLayer, planHash } from '../MocapLayer'
import { performer, snapshot } from './performer'

const KIT = 'loc-2026-10-23T03-00-01-000'
let p: Performer3D
beforeAll(async () => { p = await performer(WALK_TOWARD) })
afterAll(() => { vi.unstubAllGlobals() })

describe('MocapLayer', () => {
  it('poses deterministically in t: the same t gives the same figure, whatever was shown before', () => {
    const layer = new MocapLayer(p, WALK_TOWARD, KIT)
    layer.pose(1.3)
    const a = snapshot(layer.object)
    layer.pose(0); layer.pose(3.1); layer.pose(1.3)
    expect(snapshot(layer.object)).toEqual(a)
    layer.pose(0)
    expect(snapshot(layer.object)).not.toEqual(a) // he moved
  })

  it('hangs the performer under a holder: WorldRoot.place moves only the holder, never the performer\'s own object', () => {
    const projector = new PerspectiveCamera()
    projector.position.set(0, 1.6, 0)
    const root = new WorldRoot(projector)
    const layer = new MocapLayer(p, WALK_TOWARD, KIT)
    const own = { pos: p.object.position.clone(), scale: p.object.scale.clone() }
    root.place(layer.object) // a kit world is metric: s = 1 leaves the holder at identity
    expect(layer.object.position.toArray()).toEqual([0, 0, 0])
    expect(layer.object.scale.toArray()).toEqual([1, 1, 1])
    root.s = 2
    root.place(layer.object)
    expect(layer.object.scale.x).toBe(2)
    expect(layer.object.position.y).toBeCloseTo(-1.6, 9)
    // the performer's own transform (his pose in world metres) is what he was given, whatever the root does
    expect(p.object.scale.toArray()).toEqual(own.scale.toArray())
    expect(p.object.position.toArray()).toEqual(own.pos.toArray())
    expect(layer.object).not.toBe(p.object)
    expect(p.object.parent).toBe(layer.object)
  })

  it('carries a pack-shaped descriptor: fps 24, frames = ceil(duration * 24), id mocap-<plan hash>, the kit world as its location', () => {
    const layer = new MocapLayer(p, WALK_TOWARD, KIT)
    expect(layer.pack).toEqual({ kind: 'mocap', id: `mocap-${planHash(WALK_TOWARD)}`, label: '3D performer', locationId: KIT, fps: 24, frames: Math.ceil(p.duration * 24), prompt: '' })
    expect(layer.pack.id).toMatch(/^mocap-[0-9a-f]{8}$/)
    expect(layer.pack.id).toMatch(/^[\w-]{1,120}$/) // what the take lock accepts as a packId
    expect(planHash({ ...WALK_TOWARD })).toBe(planHash(WALK_TOWARD))
    expect(planHash({ ...WALK_TOWARD, pace: 1 })).not.toBe(planHash(WALK_TOWARD))
    expect(mocapPack(WALK_TOWARD, KIT, 2).frames).toBe(48)
    expect(mocapPack(WALK_TOWARD, KIT, 2.01).frames).toBe(49)
    // the Performance list's entry has the same id before the performer is built
    expect(kitPackEntry({ id: KIT, layer: null, perf: WALK_TOWARD })?.id).toBe(layer.pack.id)
    expect(kitPackEntry({ id: null, layer: null, perf: WALK_TOWARD })).toBeNull()
  })

  it('orbits a fixed point on the path at chest height', () => {
    const c = new MocapLayer(p, WALK_TOWARD, KIT).pivot()!
    expect(c.x).toBeCloseTo(0.6, 6)
    expect(c.z).toBeGreaterThan(-12.5)
    expect(c.z).toBeLessThan(-8)
    expect(c.y).toBeCloseTo(1.2, 6)
  })

  it('its duration is the world clock\'s length and the take cap', () => {
    const world = new World(async () => ({ missing: 'test' }))
    const layer = new MocapLayer(p, WALK_TOWARD, KIT)
    world.setPerformance(layer)
    expect(world.clock.duration).toBeCloseTo(layer.duration, 9)
    expect(world.group.children).toContain(layer.object)
    const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
    engine.bind(world, () => ASPECT)
    engine.tick(FRAME, ASPECT); world.frame(0)
    expect(engine.deck.recorder.capSeconds).toBeCloseTo(layer.duration, 9)
    world.setPerformance(null)
    expect(layer.object.parent).toBeNull()
  })
})
