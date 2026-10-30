// @vitest-environment jsdom
// Item 13: Fly it yourself is back in the Camera panel as one row — the controller's status from the engine's own input sources
// (a fake gamepad here; real hardware is the owner's to try), the hint, and Record filming the hand-flown path while it is on.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Quaternion, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import { StageOperatorEngine } from '../../labs/projection/operator/stageEngine'
import { resetStageMemo } from '../stage/stageMemory'
import { PresetMoves } from './PresetMoves'
import { CONNECTED, HAND_FLY_HINT, PRESS_A_BUTTON } from './HandFlyRow'

const engine = () => {
  const e = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, orbitTarget: () => new Vector3(0, 1.6, 0) })
  e.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35)
  return e
}
let pads: (Gamepad | null)[] = []
const fakePad = (): Gamepad => ({ id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', index: 0, connected: true, mapping: 'standard',
  timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), vibrationActuator: null } as unknown as Gamepad)
beforeEach(() => { pads = []; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads }) })
afterEach(() => { cleanup(); vi.useRealTimers(); resetStageMemo() })

function Panel({ e, record = true }: { e: StageOperatorEngine; record?: boolean }) {
  return <PresetMoves engine={e} press={(a) => a()} secs={2} primary={record} fly={flyState.on} onFly={(on) => { flyState.on = on; flyState.rerender?.() }} />
}
const flyState: { on: boolean; rerender?: () => void } = { on: false }

describe('Fly it yourself', () => {
  beforeEach(() => { flyState.on = false })

  it('says to press a button until a controller shows, then that it is connected', () => {
    vi.useFakeTimers()
    const e = engine()
    const view = render(<Panel e={e} />)
    flyState.rerender = () => view.rerender(<Panel e={e} />)
    expect(screen.getByTestId('controller-status').textContent).toBe(PRESS_A_BUTTON)
    pads = [fakePad()]
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.getByTestId('controller-status').textContent).toBe(CONNECTED)
  })

  it('turns the camera over to hand flying: the hint shows, Preview goes, and Record films the flown path; Stop ends it', () => {
    const e = engine()
    const view = render(<Panel e={e} />)
    flyState.rerender = () => view.rerender(<Panel e={e} />)
    fireEvent.click(screen.getByTestId('preset-fly'))
    expect(screen.getByTestId('preset-fly').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('hand-fly-hint').textContent).toBe(HAND_FLY_HINT)
    expect(screen.queryByTestId('preset-preview')).toBeNull()
    const rec = screen.getByTestId('preset-record')
    expect(rec.className).toMatch(/st-primary/) // the one yellow press while recording is the next step
    const toggle = vi.spyOn(e, 'toggleRecording')
    const preset = vi.spyOn(e, 'startPreset')
    fireEvent.click(rec)
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(preset).not.toHaveBeenCalled() // the hand-flown path, never a camera move
    expect(e.deck.recording).toBe(true)
    view.rerender(<Panel e={e} />)
    expect(screen.getByTestId('preset-record').textContent).toBe('Stop')
    fireEvent.click(screen.getByTestId('preset-record'))
    expect(e.deck.recording).toBe(false)
  })

  it('picking a camera move turns hand flying off again; the words never say gyro, stabiliser or rig', () => {
    const e = engine()
    const view = render(<Panel e={e} />)
    flyState.rerender = () => view.rerender(<Panel e={e} />)
    fireEvent.click(screen.getByTestId('preset-fly'))
    fireEvent.click(screen.getByTestId('preset-orbit-right'))
    expect(screen.getByTestId('preset-fly').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('preset-orbit-right').getAttribute('aria-pressed')).toBe('true') // the move is what Play plays again
    fireEvent.click(screen.getByTestId('preset-fly'))
    expect(screen.getByTestId('presets').textContent).not.toMatch(/gyro|stabilis|\brig\b/i)
  })
})
