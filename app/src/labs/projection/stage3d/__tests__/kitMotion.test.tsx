// @vitest-environment jsdom
// prop-movement wave: the kit layer applies a piece's base tilt in the documented order (yaw, then pitch, then roll, each about
// the model's own axes) and poses its travelling pieces on the world clock, so the viewport, every depth/mask capture and the clay
// the draw sees all show the drive at time t. The world's clock hook carries the travel's duration into the clock and the take cap.
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitItem, ScenePlan, World3D } from '../../../../stage3d/contract'
import { BATTLEFIELD } from '../../../../stage3d/presets'
import { buildWorld, KIT_INDEX } from '../../../../stage3d/world'
import { World } from '../../world/World'
import { KitLayer, structuralKey } from '../KitLayer'

const ID = 'loc-2026-10-28T00-00-00-000'
const D = Math.PI / 180
const PERF = { path: [[0, 0], [0, 0.2]] as [number, number][] }
const moving = (over: Partial<KitItem> = {}): ScenePlan => ({
  ...BATTLEFIELD, tufts: 0, puddles: 0, kit: [{ kind: 'crates', at: [0, 0], ...over }],
})
/** a world with one piece root already in its scene, as buildWorld leaves it (no sky load in these tests) */
function onePieceWorld(): { world: World3D; root: THREE.Object3D } {
  const scene = new THREE.Scene()
  const root = new THREE.Object3D()
  root.userData[KIT_INDEX] = 0
  scene.add(root)
  return { world: { scene, groundAt: () => 0, ready: Promise.resolve(), dispose: () => {} }, root }
}
const layerOf = (plan: ScenePlan) => {
  const { world, root } = onePieceWorld()
  return { layer: new KitLayer(world, ID, plan, PERF), root }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('structuralKey (prop-movement wave)', () => {
  it('a tilt or a travel change applies in place too, not by a rebuild', () => {
    const a = moving()
    const b = moving({ pitchDeg: 20, rollDeg: -5, move: { path: [[0, 0], [5, 0]], speed: 2 } })
    expect(structuralKey(b)).toBe(structuralKey(a))
  })
})

describe('the layer applies a piece\'s base tilt', () => {
  it('yaw, then pitch, then roll about the model\'s own axes (Euler YXZ), matching Ry·Rx·Rz exactly', () => {
    const { layer, root } = layerOf(moving({ yawDeg: 10, pitchDeg: 30, rollDeg: -15 }))
    layer.applyPlan(layer.plan)
    expect(root.rotation.order).toBe('YXZ')
    expect(root.rotation.y).toBeCloseTo(10 * D, 8)
    expect(root.rotation.x).toBeCloseTo(30 * D, 8)
    expect(root.rotation.z).toBeCloseTo(-15 * D, 8)
    const want = new THREE.Matrix4().makeRotationY(10 * D).multiply(new THREE.Matrix4().makeRotationX(30 * D)).multiply(new THREE.Matrix4().makeRotationZ(-15 * D))
    root.updateMatrixWorld(true)
    for (let i = 0; i < 16; i++) expect(root.matrixWorld.elements[i]).toBeCloseTo(want.elements[i], 8)
    layer.dispose()
  })

  it('a yaw-only piece turns exactly as before (old saved scenes are untouched)', () => {
    const { layer, root } = layerOf(moving({ yawDeg: 40 }))
    layer.applyPlan(layer.plan)
    expect(root.rotation.y).toBeCloseTo(40 * D, 8)
    expect(root.rotation.x).toBeCloseTo(0, 8)
    expect(root.rotation.z).toBeCloseTo(0, 8)
    layer.dispose()
  })

  it('buildWorld puts the same tilt and travel start on the built piece (the depth and mask passes see them)', () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (_u, onLoad) { const t = new THREE.Texture() as THREE.Texture<HTMLImageElement>; onLoad?.(t); return t })
    const plan = moving({ yawDeg: 10, pitchDeg: 30, rollDeg: -15, move: { path: [[1, 2], [1, 12]], speed: 2 } })
    const world = buildWorld(plan)
    const root = world.scene.children.find((o) => typeof o.userData[KIT_INDEX] === 'number')!
    expect(root.rotation.order).toBe('YXZ')
    expect(root.rotation.y).toBeCloseTo(0, 8) // (front-faces) the travel starts facing +z, led by its front: the resting turn is not added
    expect(root.rotation.x).toBeCloseTo(30 * D, 8)
    expect(root.position.x).toBeCloseTo(1, 8) // t = 0: at the path's first point, not the resting `at`
    expect(root.position.z).toBeCloseTo(2, 8)
    world.dispose()
  })
})

describe('the layer poses a travelling piece on the clock', () => {
  it('runs at the stated speed, faces the travel heading (front first, the resting turn left out), holds the end', () => {
    const { layer, root } = layerOf(moving({ yawDeg: 5, move: { path: [[0, 0], [10, 0]], speed: 2 } }))
    layer.applyPlan(layer.plan)
    layer.poseAt(2.5)
    expect(root.position.x).toBeCloseTo(5, 6)
    expect(root.rotation.y).toBeCloseTo(90 * D, 6) // (front-faces) facing the way it travels; the resting turn of 5 is not added
    layer.poseAt(100) // past the travel: holds the end
    expect(root.position.x).toBeCloseTo(10, 6)
    expect(layer.moveDuration).toBeCloseTo(5, 6)
    layer.dispose()
  })

  it('faceTravel off keeps the base turn; a piece without a move is never re-posed', () => {
    const still = layerOf(moving({ yawDeg: 5 }))
    still.layer.applyPlan(still.layer.plan)
    still.layer.poseAt(3)
    expect(still.root.position.x).toBeCloseTo(0, 8)
    expect(still.root.rotation.y).toBeCloseTo(5 * D, 8)
    still.layer.dispose()
    const { layer, root } = layerOf(moving({ yawDeg: 5, move: { path: [[0, 0], [10, 0]], speed: 2, faceTravel: false } }))
    layer.applyPlan(layer.plan)
    layer.poseAt(2.5)
    expect(root.position.x).toBeCloseTo(5, 6)
    expect(root.rotation.y).toBeCloseTo(5 * D, 8)
    layer.dispose()
  })
})

describe('the world clock hook', () => {
  it('poses the layer at the clock\'s time (a capture at t sees the drive there) and holds the clock for the travel', () => {
    const world = new World()
    const { layer } = layerOf(moving({ move: { path: [[0, 0], [10, 0]], speed: 1 } }))
    const off = world.addClockHook({ get duration() { return layer.moveDuration }, pose: (t) => layer.poseAt(t) })
    expect(world.hookDuration).toBeCloseTo(10, 6)
    expect(world.clock.duration).toBeCloseTo(10, 6)
    world.at(4, () => {
      const root = layer.group.children.find((o) => typeof o.userData[KIT_INDEX] === 'number')!
      expect(root.position.x).toBeCloseTo(4, 6)
    })
    expect(world.clock.time).toBe(0) // at() put the clock back
    off()
    expect(world.hookDuration).toBe(0)
    world.dispose()
    layer.dispose()
  })
})
