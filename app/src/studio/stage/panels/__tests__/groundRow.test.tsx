// @vitest-environment jsdom
// The Set panel's Ground row: Flat | Rolling, the hint under it; a world with no choice reads Rolling (its takes stay as they were);
// a press saves through the world's ground route once, shows the choice at once and holds it until the world read again carries
// it; a refusal says so and the saved choice shows again. The row is the first thing in The set's card.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GROUND_HINT, GroundRow } from '../GroundRow'

afterEach(cleanup)
const pressed = (id: string) => screen.getByTestId(id).getAttribute('aria-pressed')

describe('the Ground row', () => {
  it('a world with no choice reads Rolling; a flat one reads Flat; the hint is the owner line', () => {
    const r = render(<GroundRow worldId="loc-a" plan={{}} save={vi.fn()} />)
    expect(pressed('set-ground-rolling')).toBe('true')
    expect(pressed('set-ground-flat')).toBe('false')
    expect(screen.getByTestId('set-ground-hint').textContent).toBe('Flat for tracks, floors and streets; Rolling for fields and open country.')
    expect(GROUND_HINT).toMatch(/^Flat for tracks/)
    r.rerender(<GroundRow worldId="loc-a" plan={{ ground: 'flat' }} save={vi.fn()} />)
    expect(pressed('set-ground-flat')).toBe('true')
  })

  it('a press saves once, shows at once and holds until the world carries it; the one already chosen saves nothing', async () => {
    const save = vi.fn(async () => ({}))
    const r = render(<GroundRow worldId="loc-a" plan={{ ground: 'flat' }} save={save} />)
    fireEvent.click(screen.getByTestId('set-ground-flat'))
    expect(save).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByTestId('set-ground-rolling')) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('loc-a', 'rolling')
    expect(pressed('set-ground-rolling')).toBe('true') // the world has not been read again yet: the choice holds
    expect((screen.getByTestId('set-ground-flat') as HTMLButtonElement).disabled).toBe(true)
    r.rerender(<GroundRow worldId="loc-a" plan={{ ground: 'rolling' }} save={save} />)
    expect(pressed('set-ground-rolling')).toBe('true')
    expect((screen.getByTestId('set-ground-flat') as HTMLButtonElement).disabled).toBe(false)
  })

  it('a refused switch says why and shows the saved ground again', async () => {
    const save = vi.fn(async () => { throw new Error('the set would not be valid') })
    render(<GroundRow worldId="loc-a" plan={{ ground: 'flat' }} save={save} />)
    await act(async () => { fireEvent.click(screen.getByTestId('set-ground-rolling')) })
    expect(screen.getByTestId('set-ground-error').textContent).toBe('The ground was not changed: the set would not be valid')
    expect(pressed('set-ground-flat')).toBe('true')
  })
})
