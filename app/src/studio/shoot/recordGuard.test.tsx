// @vitest-environment jsdom
// QA m9: a rapid double or triple press of Record cannot start, stop and discard a take; starting over an unlocked take asks first;
// a stop that kept nothing says so.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import { ASPECT } from '../../labs/projection/operator/testRig'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { CameraPanel as ShootScreen } from '../stage/panels/CameraPanel'

vi.mock('../stage/panels/blocking', () => ({ BlockingPanel: () => null }))
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear() })

function setup() {
  const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
  const lab = {
    op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: null, s: { source: 'synthetic' }, shot: undefined, shots: [], pickSource: vi.fn(),
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
  return { lab, engine }
}
const frames = (e: OperatorEngine, n: number) => { for (let i = 0; i < n; i++) e.tick(0.1, ASPECT) }
/** the Camera pane's Record press (R): the hand-flown take has no button on the Stage */
const click = () => act(() => { fireEvent.keyDown(window, { code: 'KeyR', key: 'r' }) })

describe('Record press guard', () => {
  it('a rapid second click is ignored: the recording runs on, and the earlier take is not replaced by a sliver', () => {
    vi.useFakeTimers()
    const { lab, engine } = setup()
    engine.toggleRecording(); frames(engine, 5); engine.toggleRecording() // an earlier take, not locked
    const earlier = engine.deck.take
    render(<ShootScreen lab={lab} />)
    vi.advanceTimersByTime(1000)
    click() // asks: this would replace the unlocked take
    act(() => { fireEvent.click(screen.getByTestId('record-ask-yes')) })
    expect(engine.deck.recording).toBe(true)
    frames(engine, 1)
    click(); click() // the double and triple click
    expect(engine.deck.recording).toBe(true)
    expect(engine.deck.take).toBe(earlier)
    expect(engine.deck.takeCount).toBe(1)
  })

  it('starting over an unlocked take asks first; Keep it leaves everything as it was', () => {
    vi.useFakeTimers()
    const { lab, engine } = setup()
    engine.toggleRecording(); frames(engine, 5); engine.toggleRecording()
    render(<ShootScreen lab={lab} />)
    click()
    expect(screen.getByTestId('record-ask')).toBeTruthy()
    expect(engine.deck.recording).toBe(false)
    act(() => { fireEvent.click(screen.getByTestId('record-ask-no')) })
    expect(screen.queryByTestId('record-ask')).toBeNull()
    expect(engine.deck.recording).toBe(false)
  })

  it('a stop that kept nothing says so', () => {
    vi.useFakeTimers()
    const { lab, engine } = setup()
    render(<ShootScreen lab={lab} />)
    click() // starts; no frame ticks before the stop
    vi.advanceTimersByTime(1000)
    click()
    expect(engine.deck.recording).toBe(false)
    expect(screen.getByTestId('record-note').textContent).toContain('too short')
  })
})

describe('the R key goes through the same guard', () => {
  const r = () => act(() => { fireEvent.keyDown(window, { code: 'KeyR', key: 'r' }) })
  it('R over an unlocked take asks first; Keep it leaves it as it was', () => {
    vi.useFakeTimers()
    const { lab, engine } = setup()
    engine.toggleRecording(); frames(engine, 5); engine.toggleRecording()
    const earlier = engine.deck.take
    render(<ShootScreen lab={lab} />)
    r()
    expect(screen.getByTestId('record-ask')).toBeTruthy()
    expect(engine.deck.recording).toBe(false)
    act(() => { fireEvent.click(screen.getByTestId('record-ask-no')) })
    expect(engine.deck.take).toBe(earlier)
  })
  it('a rapid second R is ignored: the take runs on; R after the pause stops it', () => {
    vi.useFakeTimers()
    const { lab, engine } = setup()
    render(<ShootScreen lab={lab} />)
    r()
    expect(engine.deck.recording).toBe(true)
    frames(engine, 3)
    r(); r()
    expect(engine.deck.recording).toBe(true)
    vi.advanceTimersByTime(1000); frames(engine, 3)
    r()
    expect(engine.deck.recording).toBe(false)
    expect(engine.deck.takeCount).toBe(1)
  })
})
