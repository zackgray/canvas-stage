// The Orbit rig about a measured level: a tilted up keeps the camera's height over the real floor through 80 degrees.
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { floorAlongUp, type Level } from '../../projection/engine/level'
import { emptyInput } from '../input/types'
import { OrbitRig } from '../rigs/orbitRig'
import type { RigContext, RigPose } from '../rigs/types'
import { poseQuaternion } from '../rigs/types'

const DEG = Math.PI / 180
const TILT = 6.7 * DEG
// world up leaning 6.7 degrees toward +z
const up = new Vector3(0, Math.cos(TILT), Math.sin(TILT))
const level: Level = { up, floor: new Vector3(0, 1.6, 0).addScaledVector(up, -1.402) }
const TARGET = new Vector3(0, 1.2, -6)

function ctx(): RigContext {
  return {
    dt: 1 / 60, input: emptyInput(), aimDelta: { yaw: 0, pitch: 0 }, gyro: { yaw: 0, pitch: 0, roll: 0 }, speedScale: 1,
    car: { position: new Vector3(), heading: 0, speed: 0, distance: 0 }, carAim: new Vector3(0, 0.8, 0),
    hfov: 1, vfov: 0.6, followMode: 'pan', orbitTarget: () => TARGET.clone(),
  }
}

const start: RigPose = { position: new Vector3(0, 1.6, 2), yaw: 0, pitch: 0, roll: 0 }
const heightOver = (p: Vector3) => up.dot(p) - up.dot(level.floor!)
const azimuth = (p: Vector3) => Math.atan2(p.x, p.z - TARGET.z) / DEG

describe('orbit rig about a fitted level', () => {
  it('keeps the camera height within 2 cm over an 80 degree sweep, and the horizon level', () => {
    const rig = new OrbitRig()
    rig.level = () => level
    const c = ctx()
    rig.enter(start, c)
    const h0 = heightOver(start.position)
    let worst = 0
    let maxSweep = 0
    // 0.5 degree steps out to +40 and back through to -40: an 80 degree sweep
    const steps = [...Array(80).fill(0.5), ...Array(160).fill(-0.5)]
    for (const s of steps) {
      rig.drag(s * DEG, 0)
      const pose = rig.update(c)
      worst = Math.max(worst, Math.abs(heightOver(pose.position) - h0))
      maxSweep = Math.max(maxSweep, Math.abs(azimuth(pose.position)))
      // no roll against the real floor: the camera's right-hand axis stays horizontal about the fitted up
      expect(Math.abs(new Vector3(1, 0, 0).applyQuaternion(poseQuaternion(pose)).dot(up))).toBeLessThan(1e-6)
    }
    expect(maxSweep).toBeGreaterThan(39)
    expect(worst).toBeLessThan(0.02)
  })

  it('without a level the camera stays at plain y, which drifts off the real floor', () => {
    const rig = new OrbitRig()
    rig.level = () => null
    const c = ctx()
    rig.enter(start, c)
    rig.drag(40 * DEG, 0)
    const pose = rig.update(c)
    expect(pose.position.y).toBe(1.6)
    expect(Math.abs(heightOver(pose.position) - heightOver(start.position))).toBeGreaterThan(0.02)
  })

  it('the floor clamp is the fitted floor along up, 0.2 m without a fit', () => {
    const rig = new OrbitRig()
    rig.level = () => level
    const c = ctx()
    rig.enter(start, c)
    c.input.lift = -1
    let pose = start
    for (let i = 0; i < 60 * 10; i++) pose = rig.update(c)
    expect(up.dot(pose.position)).toBeCloseTo(floorAlongUp(level), 6)
    expect(floorAlongUp(null)).toBe(0.2)
  })
})
