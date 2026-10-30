// @vitest-environment jsdom
// prop-movement wave: the prop card's Advanced extras — the base tilt steppers (pitch/roll), the reset of all three rotation axes,
// and the travel controls (speed presets write at once on a saved path, the facing toggle, Clear path). Arming needs the Stage's
// own view (lab.stage), so it is disabled in this bare render.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitItem } from '../../../../stage3d/contract'
import type { SetPlaceState } from '../../../scene/useSetPlace'
import { PropAdvanced } from '../PropAdvanced'

const MOVE = { path: [[2, -3], [12, -3]] as [number, number][], speed: 3 }
const itemOf = (over: Partial<KitItem> = {}): KitItem => ({ kind: 'crate', at: [2, -3], label: 'Locomotive', pieceTag: 'prop:loco', ...over })

function mount(item: KitItem) {
  const place = {
    item,
    tiltBy: vi.fn(() => Promise.resolve()),
    resetRotation: vi.fn(() => Promise.resolve()),
    setMove: vi.fn(() => Promise.resolve()),
  } as unknown as SetPlaceState
  render(<PropAdvanced place={place} />)
  return place
}

afterEach(cleanup)

describe('the prop card\'s Advanced extras', () => {
  it('the tilt steppers nudge pitch and roll by a degree; Reset rotation zeroes all three', () => {
    const place = mount(itemOf({ yawDeg: 4, pitchDeg: 2, rollDeg: -1 }))
    fireEvent.click(screen.getByLabelText('Pitch up'))
    expect(place.tiltBy).toHaveBeenCalledWith('pitchDeg', 1)
    fireEvent.click(screen.getByLabelText('Roll down'))
    expect(place.tiltBy).toHaveBeenCalledWith('rollDeg', -1)
    fireEvent.click(screen.getByTestId('prop-rotation-reset'))
    expect(place.resetRotation).toHaveBeenCalledTimes(1)
  })

  it('a piece with no rotation anywhere has a quiet reset', () => {
    mount(itemOf())
    expect((screen.getByTestId('prop-rotation-reset') as HTMLButtonElement).disabled).toBe(true)
  })

  it('Move to a spot waits for the Stage view; a saved path shows its length and time, and Clear path clears it', () => {
    const place = mount(itemOf({ move: MOVE }))
    expect((screen.getByTestId('prop-move-arm') as HTMLButtonElement).disabled).toBe(true) // no lab.stage in this render
    expect(screen.getByTestId('prop-move-line').textContent).toMatch(/Travels 10\.0 m at 3 m\/s — about 3\.3 s, then holds/)
    fireEvent.click(screen.getByTestId('prop-move-clear'))
    expect(place.setMove).toHaveBeenCalledWith(null)
  })

  it('a saved path: the speed presets and the facing toggle write at once; the default faces the way it travels', () => {
    const place = mount(itemOf({ move: MOVE }))
    fireEvent.click(screen.getByTestId('prop-move-speed-fast'))
    expect(place.setMove).toHaveBeenCalledWith({ ...MOVE, speed: 8 })
    fireEvent.click(screen.getByTestId('prop-move-face')) // on by default: one press turns it off
    expect(place.setMove).toHaveBeenCalledWith({ ...MOVE, faceTravel: false })
  })

  it('a path saved with the facing off reads back as off', () => {
    mount(itemOf({ move: { ...MOVE, faceTravel: false } }))
    expect((screen.getByTestId('prop-move-face') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByTestId('prop-move-line').textContent).toMatch(/keeping its own facing/)
  })

  it('the custom speed box takes a number', () => {
    const place = mount(itemOf({ move: MOVE }))
    fireEvent.change(screen.getByTestId('prop-move-custom'), { target: { value: '4.5' } })
    expect(place.setMove).toHaveBeenCalledWith({ ...MOVE, speed: 4.5 })
  })
})
