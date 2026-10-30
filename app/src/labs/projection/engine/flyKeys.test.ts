// S-01: the fly keys while the set is off the page (Develop, Render), and keys aimed at page controls.
import { Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stageView } from '../operator/testRig'
import { FlyKeys } from './flyKeys'
import { RestGate } from './restGate'
import { viewMoved } from './viewProbe'

type Handler = (e: unknown) => void
let on: Map<string, Set<Handler>>
beforeEach(() => {
  on = new Map()
  vi.stubGlobal('window', {
    addEventListener: (t: string, fn: Handler) => { if (!on.has(t)) on.set(t, new Set()); on.get(t)!.add(fn) },
    removeEventListener: (t: string, fn: Handler) => { on.get(t)?.delete(fn) },
  })
})
afterEach(() => vi.unstubAllGlobals())

const body = { tagName: 'BODY', isContentEditable: false }
const key = (type: string, code: string, target: object = body) => { for (const fn of on.get(type) ?? []) fn({ code, target }) }

function fly() {
  const view = stageView()
  const controls = { target: new Vector3(0, 1, -8) } as OrbitControls
  return { view, keys: new FlyKeys(view, controls) }
}
const pose = (v: PerspectiveCamera) => v.position.toArray()
/** Hold WASDQE for a second of frames. */
function flyAround(keys: FlyKeys, target: object = body) {
  for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']) {
    key('keydown', c, target)
    for (let i = 0; i < 10; i++) keys.update(1 / 60)
    key('keyup', c, target)
  }
}

describe('fly keys off the set\'s page', () => {
  it('Develop: WASD/QE leave the hidden camera where it is, so the motion watch never fires', () => {
    const { view, keys } = fly()
    const gate = new RestGate()
    viewMoved(gate, view)
    keys.setEnabled(false)
    const before = pose(view)
    for (let i = 0; i < 6; i++) {
      flyAround(keys)
      expect(viewMoved(gate, view)).toBe(false)
    }
    expect(pose(view)).toEqual(before)
    keys.dispose()
  })

  it('control: on stage the same keys fly', () => {
    const { view, keys } = fly()
    const before = pose(view)
    flyAround(keys)
    expect(pose(view)).not.toEqual(before)
    keys.dispose()
  })

  it('a key held when the page switches stops flying; the keys work again on return', () => {
    const { view, keys } = fly()
    key('keydown', 'KeyW')
    keys.setEnabled(false)
    const before = pose(view)
    for (let i = 0; i < 30; i++) keys.update(1 / 60)
    expect(pose(view)).toEqual(before)
    keys.setEnabled(true)
    key('keydown', 'KeyW')
    keys.update(1 / 60)
    expect(pose(view)).not.toEqual(before)
    keys.dispose()
  })

  it('on stage, keys aimed at a select, button, number box or editable text do not fly', () => {
    for (const target of [{ tagName: 'SELECT' }, { tagName: 'BUTTON' }, { tagName: 'INPUT', type: 'number' },
      { tagName: 'INPUT', type: 'range' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }]) {
      const { view, keys } = fly()
      const before = pose(view)
      flyAround(keys, target)
      expect(pose(view)).toEqual(before)
      keys.dispose()
    }
  })
})

