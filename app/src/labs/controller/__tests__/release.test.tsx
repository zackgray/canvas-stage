// Owner 2026-10-28: no button let go of a held camera, and the owner flies with both thumbs on the sticks. The pad's Create (it
// rewound the timeline) is now the release, as Esc is on the keyboard; Home alone rewinds. Release stops a replay where the camera
// is, frees the rig so the sticks fly it from there, and flashes what it did ("Already free" when nothing was held).
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALREADY_FREE_TEXT, RELEASED_TEXT } from '../engine/actions'
import { OperatorEngine } from '../engine/engine'
import { GamepadSource } from '../input/gamepadSource'
import { emptyInput, type Action } from '../input/types'
import type { CameraSample } from '../take/types'
import { MappingOverlay } from '../ui/MappingOverlay'

vi.mock('dualsense-ts', () => ({ Dualsense: class {}, WebHIDProvider: class {} }))
const { DualsenseSource } = await import('../input/dualsenseSource')

function scripted() {
  const engine = new OperatorEngine({ rigs: ['free', 'dolly', 'crane', 'orbit', 'follow'], rig: 'follow', car: false })
  const queued: Action[] = []
  const input = emptyInput()
  engine.hub.poll = () => {
    engine.hub.state = { ...input, actions: new Set(queued.splice(0)) }
    return engine.hub.state
  }
  const press = (...a: Action[]) => { queued.push(...a); engine.tick(1 / 60, 16 / 9) }
  const frames = (n: number) => { for (let k = 0; k < n; k++) engine.tick(1 / 60, 16 / 9) }
  return { engine, press, frames, input }
}
/** a replayed path: 2 m to the right over 2 s */
const path: CameraSample[] = Array.from({ length: 49 }, (_, k) => ({ t: k / 24, position: [-3 + k / 24, 1.5, 4], quaternion: [0, 0, 0, 1], focal: 35, focus: 5 }))
const x = (e: OperatorEngine) => Math.round(e.out.position.x * 100) / 100

afterEach(() => { vi.unstubAllGlobals() })

describe('Release (Create / Esc)', () => {
  it('a held rig (Follow) lets go to Free and says so; pressed again it is quietly already free', () => {
    const { engine, press } = scripted()
    press('release')
    expect(engine.rigId).toBe('free')
    expect(engine.message).toBe(RELEASED_TEXT)
    press('release')
    expect(engine.message).toBe(ALREADY_FREE_TEXT)
  })

  it('a replay stops where the camera is now (not back at its start), and the sticks fly it on from there', () => {
    const { engine, press, frames, input } = scripted()
    press('rig:free')
    engine.playRecord(path, 0)
    frames(60)
    expect(x(engine)).toBe(-2) // a second along the path
    press('release')
    expect(engine.deck.playback).toBeNull()
    expect(engine.timeline.playing).toBe(false)
    expect(x(engine)).toBe(-2) // no jump
    expect(engine.message).toBe(RELEASED_TEXT)
    input.move = { x: 1, y: 0 }
    frames(30)
    expect(engine.out.position.x).toBeGreaterThan(-1.95) // flying free, from where it was let go
  })

  it('Home still rewinds the timeline; Create no longer does', () => {
    const { engine, press } = scripted()
    engine.timeline.time = 3
    press('release')
    expect(engine.timeline.time).toBe(3)
    press('rewind')
    expect(engine.timeline.time).toBe(0)
  })
})

describe('the pad buttons', () => {
  it('Create on a DualSense over WebHID is the release', () => {
    const src = new DualsenseSource()
    const b = (state = false) => ({ state })
    const stick = { analog: { x: b(0 as never), y: b(0 as never), button: b() } }
    const ds = { connection: { state: true }, cross: b(), square: b(), triangle: b(), circle: b(), options: b(), create: b(true),
      ps: b(), mute: b(),
      right: { ...stick, trigger: { pressure: 0 }, bumper: b() }, left: { ...stick, trigger: { pressure: 0 }, bumper: b() },
      dpad: { left: b(), right: b(), up: b(), down: b() }, touchpad: { button: b(), left: { contact: b(), x: b(0 as never), y: b(0 as never) } },
      orientation: { yaw: 0, pitch: 0, roll: 0 }, gyroscope: { x: b(0 as never), y: b(0 as never), z: b(0 as never) } }
    ;(src as unknown as { ds: unknown }).ds = ds
    expect(src.poll()?.frame.actions).toEqual(['release'])
    expect(src.poll()?.frame.actions).toEqual([]) // one press, one release
  })

  it('Create / View on any standard pad (button 8) is the release', () => {
    const buttons = Array.from({ length: 18 }, (_, i) => ({ pressed: i === 8, value: i === 8 ? 1 : 0 }))
    vi.stubGlobal('navigator', { getGamepads: () => [{ id: 'pad', mapping: 'standard', connected: true, buttons, axes: [0, 0, 0, 0] }] })
    expect(new GamepadSource().poll(() => false)?.frame.actions).toEqual(['release'])
  })

  it('the mapping table shows Create / Esc as the release and Home as the rewind', () => {
    const html = renderToStaticMarkup(<MappingOverlay />)
    expect(html).toContain('<td>Create</td><td><kbd>Esc</kbd></td><td>Release the hold: stop the move, fly free from here</td>')
    expect(html).toContain('<td>-</td><td><kbd>Home</kbd></td><td>Rewind timeline</td>')
    expect(html).not.toContain('<td>Create</td><td><kbd>Home</kbd>')
  })
})

// W1-F1: the camera-start keys (Set start here / Back to start / Play take / Stop take / clear the aim). The pad kept only the
// two buttons nothing else could use — PS and the microphone mute — so the rest are keyboard-only (the mapping table says so).
describe('the camera-start buttons', () => {
  const b = (state = false) => ({ state })
  const stick = { analog: { x: b(0 as never), y: b(0 as never), button: b() } }
  const dsOf = (over: Record<string, unknown>) => ({ connection: { state: true }, cross: b(), square: b(), triangle: b(), circle: b(),
    options: b(), create: b(), ps: b(), mute: b(),
    right: { ...stick, trigger: { pressure: 0 }, bumper: b() }, left: { ...stick, trigger: { pressure: 0 }, bumper: b() },
    dpad: { left: b(), right: b(), up: b(), down: b() }, touchpad: { button: b(), left: { contact: b(), x: b(0 as never), y: b(0 as never) } },
    orientation: { yaw: 0, pitch: 0, roll: 0 }, gyroscope: { x: b(0 as never), y: b(0 as never), z: b(0 as never) }, ...over })
  const pollDs = (ds: unknown) => {
    const src = new DualsenseSource()
    ;(src as unknown as { ds: unknown }).ds = ds
    return src.poll()?.frame.actions
  }
  const padButtons = (pressed: number) => Array.from({ length: 18 }, (_, i) => ({ pressed: i === pressed, value: i === pressed ? 1 : 0 }))
  const pollPad = (pressed: number | null) => {
    const pads = pressed === null ? [] : [{ id: 'pad', mapping: 'standard', connected: true, buttons: padButtons(pressed), axes: [0, 0, 0, 0] }]
    vi.stubGlobal('navigator', { getGamepads: () => pads })
    return new GamepadSource().poll(() => false)?.frame.actions ?? null
  }

  it('the DualSense\'s PS button is Play take; its microphone mute is Back to start', () => {
    expect(pollDs(dsOf({ ps: b(true) }))).toEqual(['playTake'])
    expect(pollDs(dsOf({ mute: b(true) }))).toEqual(['backToStart'])
  })

  it('the standard pad\'s home button (16, the PS button) is Play take', () => {
    expect(pollPad(16)).toEqual(['playTake'])
    expect(pollPad(0)).toEqual(['still']) // the face buttons are untouched
  })

  it('a pad that drops out mid-press and comes back still held does not press again (no stuck or phantom camera move)', () => {
    const src = new GamepadSource()
    const held = [{ id: 'pad', mapping: 'standard', connected: true, buttons: padButtons(0), axes: [0, 0, 0, 0] }] // Cross held
    vi.stubGlobal('navigator', { getGamepads: () => held })
    expect(src.poll(() => false)?.frame.actions).toEqual(['still'])
    vi.stubGlobal('navigator', { getGamepads: () => [] }) // it disconnects
    expect(src.poll(() => false)).toBeNull()
    expect(src.poll(() => false)).toBeNull() // still gone: nothing accumulates
    vi.stubGlobal('navigator', { getGamepads: () => held }) // back, the button never released
    expect(src.poll(() => false)?.frame.actions).toEqual([]) // held is not a new press
  })
})
