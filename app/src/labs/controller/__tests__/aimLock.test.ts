// fly-with-aim-lock on the engine: while the lock is set the camera's position stays the operator's (a fly input moves it)
// but its aim turns to the target every frame, following the target as it moves; letting the lock go hands the aimed pose to
// the rig, so there is no snap back to where the head was pointed before the lock.
import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { OperatorEngine } from '../engine/engine'
import { emptyInput } from '../input/types'

function hosted() {
  const e = new OperatorEngine({ rigs: ['free'], rig: 'free', car: false })
  e.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35) // looking down -Z
  e.hub.poll = () => ({ ...emptyInput(), move: { x: 0, y: 1 } }) // W held: forward flight, no mouse
  return e
}
const tick = (e: OperatorEngine, secs: number) => { for (let t = 0; t < secs - 1e-9; t += 1 / 60) e.tick(1 / 60, 16 / 9) }
/** where the camera's lens points (three.js: -Z through the quaternion) */
const forward = (e: OperatorEngine) => new Vector3(0, 0, -1).applyQuaternion(e.out.quaternion)
const aimDot = (e: OperatorEngine, target: Vector3) => forward(e).dot(target.clone().sub(e.out.position).normalize())

describe('fly with the aim locked', () => {
  it('the aim stays on the target while the position flies free', () => {
    const e = hosted()
    const target = new Vector3(4, 1.2, -2)
    e.aimLock = () => target
    tick(e, 1)
    expect(e.out.position.z).toBeLessThan(4) // it flew forward, not sat on the mark
    expect(aimDot(e, target)).toBeGreaterThan(0.999) // and the lens is on the target, not where the head was
  })

  it('the aim follows the target as it moves', () => {
    const e = hosted()
    const target = new Vector3(0, 1.2, 0)
    e.aimLock = () => target
    tick(e, 0.5)
    target.set(-4, 1.2, -2)
    tick(e, 0.2)
    expect(aimDot(e, target)).toBeGreaterThan(0.999)
  })

  it('letting the lock go keeps the aim: the rig takes the aimed pose over, no snap back', () => {
    const e = hosted()
    const target = new Vector3(4, 1.2, -2)
    e.aimLock = () => target
    tick(e, 0.5)
    const aimed = forward(e).clone()
    expect(aimed.dot(new Vector3(4, -0.4, -8).normalize())).toBeGreaterThan(0.99) // aimed at the target, not down -Z
    e.aimLock = null
    tick(e, 0.2)
    expect(forward(e).dot(aimed)).toBeGreaterThan(0.999) // still aimed where the lock left it
  })
})
