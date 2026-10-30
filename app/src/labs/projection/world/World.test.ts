import { Mesh, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { V3 } from './geom'
import { poseAt, type CarPath } from './path'
import { depthOf, FACADE, GROUND, projectorCam, tilted } from './testGround'
import { CAR_ID, World } from './World'

const missing = async () => ({ missing: 'test: no asset' })
const PATH: CarPath = { start: [-14, 0, -6], end: [1, 0, -6], speed: 'drive', arrival: 'stop', delay: 0 }

/** A world with the street fitted from the synthetic projector and a car on PATH. */
function withCar(plane = GROUND) {
  const w = new World(missing)
  const v = depthOf(projectorCam(), [{ plane }, FACADE])
  expect(w.fitGround(v, v.cam.quaternion)).not.toBeNull()
  w.addCar(PATH)
  return w
}

describe('World: the car on the fitted street', () => {
  it('stands on the plane (wheels at the plane), facing along the path, at the clock\'s pose', () => {
    const w = withCar()
    w.clock.time = 2
    w.frame(0)
    const root = w.car!.root
    const want = poseAt(w.path!, 2)
    expect(root.position.x).toBeCloseTo(want.position[0], 6)
    expect(Math.abs(root.position.y)).toBeLessThan(0.01)
    expect(new Vector3(1, 0, 0).applyQuaternion(root.quaternion).x).toBeCloseTo(1, 6) // mesh +X = forward = +X here
    expect(new Vector3(0, 1, 0).applyQuaternion(root.quaternion).y).toBeCloseTo(1, 4)
  })

  it('on a tilted street the car takes the street\'s normal as up and its ends lie on it', () => {
    const pl = tilted(4)
    const w = withCar(pl)
    const upW = new Vector3(0, 1, 0).applyQuaternion(w.car!.root.quaternion)
    expect(upW.angleTo(new Vector3(...pl.n)) * 180 / Math.PI).toBeLessThan(0.3)
    for (const p of [w.path!.start, w.path!.end]) expect(Math.abs(pl.n[0] * p[0] + pl.n[1] * p[1] + pl.n[2] * p[2] + pl.d)).toBeLessThan(0.01)
  })

  it('the clock\'s length comes from the path', () => {
    const w = withCar()
    expect(w.clock.duration).toBeGreaterThan(w.arrive!)
  })

  it('placeholder box when the asset is missing, and it says why', async () => {
    const w = withCar()
    await new Promise((r) => setTimeout(r, 0))
    expect(w.car!.body.name).toBe('car-placeholder')
    expect(w.car!.bodyNote).toContain('test: no asset')
    expect(w.carLabel).toBe('a car')
  })

  it('a loaded mesh replaces the placeholder', async () => {
    const mesh = new Mesh()
    const w = new World(async () => ({ mesh, size: [4.5, 1.47, 2] as V3 }))
    const v = depthOf(projectorCam(), [{ plane: GROUND }, FACADE])
    w.fitGround(v, v.cam.quaternion)
    w.addCar(PATH)
    await new Promise((r) => setTimeout(r, 0))
    expect((w.car!.body as Mesh).isMesh).toBe(true)
    expect(w.car!.bodyNote).toContain('E24 car A')
    expect(w.carLabel).toBe('a red compact coupe')
    expect(w.car!.root.children.some((c) => c.name === 'car-placeholder')).toBe(false)
  })

  it('at(t): clock and car at t inside, both restored after (also when the capture throws)', () => {
    const w = withCar()
    w.clock.time = 0.5
    w.frame(0)
    const live = w.car!.root.position.x
    const seen = w.at(3, () => [w.clock.time, w.car!.root.position.x])
    expect(seen[0]).toBe(3)
    expect(seen[1]).toBeCloseTo(poseAt(w.path!, 3).position[0], 6)
    expect(w.clock.time).toBe(0.5)
    expect(w.car!.root.position.x).toBeCloseTo(live, 9)
    expect(() => w.at(4, () => { throw new Error('boom') })).toThrow('boom')
    expect(w.clock.time).toBe(0.5)
    expect(w.car!.root.position.x).toBeCloseTo(live, 9)
  })

  it('at(t, fn, poses): recorded poses win over the path', () => {
    const w = withCar()
    const x = w.at(1, () => w.car!.root.position.x, new Map([[CAR_ID, { position: [7, 0, -6] as V3, heading: Math.PI / 2, speed: 3 }]]))
    expect(x).toBe(7)
  })

  it('captures hide the path handles and keep the car; `without` takes the whole world out', () => {
    const w = withCar()
    w.setEditing(true)
    expect(w.handlesVisible).toBe(true)
    expect(w.capture(() => [w.handlesVisible, w.car!.root.visible && w.group.visible])).toEqual([false, true])
    expect(w.handlesVisible).toBe(true)
    expect(w.without(() => w.group.visible)).toBe(false)
    expect(w.group.visible).toBe(true)
    w.setEditing(false)
    expect(w.handlesVisible).toBe(false)
  })

  it('frame(dt) advances a playing clock and, Loop off, stops at its end', () => {
    const w = withCar()
    w.clock.loop = false
    w.clock.toggle()
    w.frame(0.25)
    expect(w.clock.time).toBeCloseTo(0.25, 9)
    w.frame(100)
    expect(w.clock.time).toBe(w.clock.duration)
    expect(w.clock.playing).toBe(false)
  })

  it('Loop (the default) wraps the clock past its end and the car with it, still playing', () => {
    const w = withCar()
    expect(w.clock.loop).toBe(true)
    const d = w.clock.duration
    w.clock.scrub(d - 0.1)
    w.clock.toggle()
    w.frame(0.25)
    expect(w.clock.playing).toBe(true)
    expect(w.clock.time).toBeCloseTo(0.15, 9)
    expect(w.car!.root.position.x).toBeCloseTo(poseAt(w.path!, 0.15).position[0], 6)
  })

  it('ground point under the view centre, null above the horizon', () => {
    const w = withCar()
    const cam = new PerspectiveCamera(40, 16 / 9, 0.02, 2000)
    cam.position.set(0, 1.6, 0)
    cam.lookAt(0, 1, -8)
    expect(w.groundAt(cam, { x: 0, y: 0 })![1]).toBeCloseTo(0, 3)
    expect(w.groundAt(cam, { x: 0, y: 0.9 })).toBeNull()
  })

  it('remove: no car, no sources, default clock length', () => {
    const w = withCar()
    w.removeCar()
    expect(w.car).toBeNull()
    expect(w.sources()).toEqual([])
    expect(w.clock.duration).toBe(10)
  })
})
