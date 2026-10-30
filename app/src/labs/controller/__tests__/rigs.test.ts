import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { mergeFrames } from '../input/inputHub'
import { deadzone, emptyInput } from '../input/types'
import { hfovFromFocal, vfovFromHfov } from '../math/lens'
import { FRAMING_RANGE, FollowRig } from '../rigs/followRig'
import { ORBIT_ARC_LIMIT, OrbitRig } from '../rigs/orbitRig'
import type { RigContext, RigPose } from '../rigs/types'
import { poseQuaternion } from '../rigs/types'
import { carStateAt } from '../scene/carPath'

const DEG = 180 / Math.PI
const ASPECT = 16 / 9

function ctx(over: Partial<RigContext> & { carAim: Vector3 }, focal = 50): RigContext {
  const hfov = hfovFromFocal(focal)
  return {
    dt: 1 / 60,
    input: emptyInput(),
    aimDelta: { yaw: 0, pitch: 0 },
    gyro: { yaw: 0, pitch: 0, roll: 0 },
    speedScale: 1,
    car: { position: over.carAim.clone().setY(0), heading: 0, speed: 0, distance: 0 },
    hfov,
    vfov: vfovFromHfov(hfov, ASPECT),
    followMode: 'pan',
    ...over,
  }
}

function project(pose: RigPose, p: Vector3, focal = 50) {
  const cam = new PerspectiveCamera(vfovFromHfov(hfovFromFocal(focal), ASPECT) * DEG, ASPECT, 0.1, 1000)
  cam.position.copy(pose.position)
  cam.quaternion.copy(poseQuaternion(pose))
  cam.updateMatrixWorld()
  return p.clone().project(cam)
}

describe('follow rig framing', () => {
  const start: RigPose = { position: new Vector3(0, 1.6, 12), yaw: 0.4, pitch: 0, roll: 0 }
  const carAim = new Vector3(-5, 0.8, 0)

  it('settles with the car centred when the stick is released', () => {
    const rig = new FollowRig()
    const c = ctx({ carAim })
    rig.enter(start)
    let pose = start
    for (let i = 0; i < 180; i++) pose = rig.update(c)
    const ndc = project(pose, carAim)
    expect(ndc.x).toBeCloseTo(0, 3)
    expect(ndc.y).toBeCloseTo(0, 3)
  })

  it('holds the car at the stick framing offset, then returns to centre on release', () => {
    const rig = new FollowRig()
    const c = ctx({ carAim })
    c.input.move = { x: 1, y: -0.5 }
    rig.enter(start)
    let pose = start
    for (let i = 0; i < 240; i++) pose = rig.update(c)
    let ndc = project(pose, carAim)
    expect(ndc.x).toBeCloseTo(FRAMING_RANGE.u, 3)
    expect(ndc.y).toBeCloseTo(-0.5 * FRAMING_RANGE.v, 3)

    c.input.move = { x: 0, y: 0 }
    for (let i = 0; i < 240; i++) pose = rig.update(c)
    ndc = project(pose, carAim)
    expect(Math.abs(ndc.x)).toBeLessThan(1e-3)
  })

  it('lags behind a moving car (operator feel) and catches up when it stops', () => {
    const rig = new FollowRig()
    rig.enter(start)
    const aim = carAim.clone()
    let pose = start
    for (let i = 0; i < 60; i++) {
      aim.x += 10 / 60 // 10 m/s to the right
      pose = rig.update(ctx({ carAim: aim }))
    }
    // Car moving right, camera lagging: the car sits right of centre.
    expect(project(pose, aim).x).toBeGreaterThan(0.02)
    for (let i = 0; i < 180; i++) pose = rig.update(ctx({ carAim: aim }))
    expect(Math.abs(project(pose, aim).x)).toBeLessThan(1e-3)
  })

  it('in pan mode the camera stays planted', () => {
    const rig = new FollowRig()
    rig.enter(start)
    const c = ctx({ carAim })
    c.input.move = { x: 1, y: 1 }
    const pose = rig.update(c)
    expect(pose.position.distanceTo(start.position)).toBe(0)
  })
})

describe('orbit rig', () => {
  it('caps the arc so it can never become a 360', () => {
    const rig = new OrbitRig()
    const carAim = new Vector3(0, 0.8, 0)
    const c = ctx({ carAim })
    const start: RigPose = { position: new Vector3(0, 1.6, 8), yaw: 0, pitch: 0, roll: 0 }
    rig.enter(start, c)
    c.input.move = { x: 1, y: 0 }
    let pose = start
    for (let i = 0; i < 60 * 30; i++) pose = rig.update(c)
    const angle = Math.atan2(pose.position.x, pose.position.z)
    expect(angle).toBeCloseTo(ORBIT_ARC_LIMIT, 6)
    // Still looking at the target.
    expect(project(pose, carAim).x).toBeCloseTo(0, 6)
  })
})

describe('input merging', () => {
  it('sums and clamps axes, unions actions, keeps triggers at the max', () => {
    const s = mergeFrames(
      [
        { move: { x: 1, y: 0 }, zoomIn: 0.3, actions: ['record'] },
        { move: { x: 0.5, y: -0.25 }, zoomIn: 0.8, actions: ['still'] },
      ],
      'gamepad',
    )
    expect(s.move).toEqual({ x: 1, y: -0.25 })
    expect(s.zoomIn).toBe(0.8)
    expect([...s.actions].sort()).toEqual(['record', 'still'])
    expect(s.source).toBe('gamepad')
  })

  it('deadzone kills drift and rescales to full range', () => {
    expect(deadzone(0.05, 0.05)).toEqual({ x: 0, y: 0 })
    expect(deadzone(1, 0).x).toBeCloseTo(1, 9)
  })
})

describe('car path', () => {
  it('waits, then moves forward along the street', () => {
    expect(carStateAt(0).speed).toBe(0)
    expect(carStateAt(0.5).position.distanceTo(carStateAt(0).position)).toBe(0)
    const a = carStateAt(3)
    const b = carStateAt(4)
    expect(b.distance).toBeGreaterThan(a.distance)
    expect(b.position.x).toBeGreaterThan(a.position.x)
  })
})
