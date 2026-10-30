// The two-handed prop's placement (Kimodo spike recipe): the frame on the midpoint of both wrists, GRIP_DROP toward the palms, its top
// bar along the wrist-to-wrist vector, hanging world-down about that bar; the hive centred under the pick with its rim just above it.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { framePlacement, GRIP_DROP, hiveFromPick, RIM_ABOVE_WRISTS } from '../props/frameMath.ts'

const place = (l: number[], r: number[]) => {
  const out = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
  framePlacement(new THREE.Vector3(...l), new THREE.Vector3(...r), out)
  return out
}

describe('the frame on both wrists', () => {
  it('sits on the wrist midpoint, GRIP_DROP down; the bar along left to right; hangs world-down', () => {
    const o = place([0.21, 1.46, 0.4], [-0.21, 1.42, 0.36])
    expect(o.position.x).toBeCloseTo(0, 9); expect(o.position.z).toBeCloseTo(0.38, 9)
    expect(o.position.y).toBeCloseTo(1.44 - GRIP_DROP, 9)
    const bar = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion), wv = new THREE.Vector3(-0.42, -0.04, -0.04).normalize()
    expect(bar.dot(wv)).toBeCloseTo(1, 9)
    const hang = new THREE.Vector3(0, -1, 0).applyQuaternion(o.quaternion)
    expect(hang.dot(bar)).toBeCloseTo(0, 9) // square to the bar
    expect(hang.y).toBeLessThan(-0.99) // as near straight down as a tilted bar allows
    expect(hang.y).toBeCloseTo(-Math.sqrt(1 - bar.y ** 2), 9) // the steepest drop square to the bar: no roll
  })
  it('the same placement whatever the hands\' spacing: only the centre and direction change, never the size', () => {
    const near = place([0.15, 1, 0], [-0.15, 1, 0]), far = place([0.4, 1, 0], [-0.4, 1, 0])
    expect(near.quaternion.angleTo(far.quaternion)).toBeCloseTo(0, 9)
    expect(near.position.distanceTo(far.position)).toBeCloseTo(0, 9)
  })
  it('wrists on top of each other do not make NaN', () => {
    const o = place([0, 1, 0], [0, 1, 0])
    expect([...o.position.toArray(), ...o.quaternion.toArray()].every(Number.isFinite)).toBe(true)
  })
})

describe('the hive under the pick', () => {
  it('centred on the wrist midpoint\'s ground point, its rim just above the wrists, measured from the ground there', () => {
    const h = hiveFromPick(new THREE.Vector3(0.21, 1.69, 0.32), new THREE.Vector3(-0.21, 1.69, 0.32), 1.0, 0.5)
    expect(h.at[0]).toBeCloseTo(0, 9); expect(h.at[1]).toBeCloseTo(0.32, 9)
    expect(h.rim).toBeCloseTo(0.69 + RIM_ABOVE_WRISTS, 9)
    expect(h.yaw).toBe(0.5)
  })
})
