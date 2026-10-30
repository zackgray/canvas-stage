// @vitest-environment jsdom
// The walking lane on the Set is advice: a piece in it says so in plain words; only a piece the SAVED path runs through is red.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitWorld } from '../../../labs/projection/stage3d/kitApi'
import type { ScenePlan } from '../../../stage3d/contract'
import { SetPlace } from '../SetPlace'
import { plainRefusal, type PlaceApi } from '../setPlaceApi'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const plan = (kit: ScenePlan['kit']): ScenePlan => ({ seed: 1, flat: [-3, -16, 3, 8], sky: { url: '/lab-assets/sky/procedural' }, kit })
const mk = (kit: ScenePlan['kit'], path: [number, number][]): KitWorld => ({ id: 'w', description: 'd', plan: plan(kit), perf: { path, pace: 0.8 }, still: null, createdAt: '' })
const api = (over: Partial<PlaceApi> = {}): PlaceApi => ({ edit: vi.fn(async () => {}), add: vi.fn(async () => {}), mark: vi.fn(async () => {}), ...over })
const pick = (i: number) => { const h = screen.getByTestId(`piece-drag-${i}`); fireEvent.pointerDown(h, { clientX: 1, clientY: 1, pointerId: 1 }); fireEvent.pointerUp(h, { clientX: 1, clientY: 1, pointerId: 1 }) }
const far = [[-9, -10], [-9, -6]] as [number, number][]

describe('walking lane advice on the Set', () => {
  it('a picked tree in the lane gets the plain line, with no numbers; nothing is red while no path crosses it', () => {
    render(<SetPlace world={mk([{ kind: 'tree', at: [0.5, -12] }], far)} api={api()} />)
    expect(screen.queryByTestId('set-lane')).toBeNull()
    pick(0)
    const line = screen.getByTestId('set-lane').textContent!
    expect(line).toBe('This tree is in the walking lane; move it if the subject needs to pass.')
    expect(line).not.toMatch(/\d|\[/)
    expect(screen.queryByTestId('blocking-hit-0')).toBeNull()
  })

  it('a piece outside the lane says nothing', () => {
    render(<SetPlace world={mk([{ kind: 'tree', at: [9, -12] }], far)} api={api()} />)
    pick(0)
    expect(screen.queryByTestId('set-lane')).toBeNull()
  })

  it('the saved path crossing a piece marks it red and says the path walks through it', () => {
    render(<SetPlace world={mk([{ kind: 'tree', at: [0.6, -10] }, { kind: 'tree', at: [9, -12] }], [[0.6, -14], [0.6, -6]])} api={api()} />)
    expect(screen.getByTestId('blocking-hit-0')).toBeTruthy()
    expect(screen.queryByTestId('blocking-hit-1')).toBeNull()
    pick(0)
    expect(screen.getByTestId('set-lane').textContent).toMatch(/path walks through this tree/)
  })

  it('a resize the server accepts raises no refusal; a refusal that does arrive is in plain words', async () => {
    const edit = vi.fn(async () => { throw new Error(plainRefusal('the set would not be valid after this change', ['kit[7]: tree at [2.25, -18.7] stands in the walk corridor [-3, -16, 3, 8]'], 422)) })
    render(<SetPlace world={mk([{ kind: 'tree', at: [2.25, -18.7] }], far)} api={api({ edit })} />)
    pick(0)
    fireEvent.click(screen.getByTestId('place-larger'))
    await waitFor(() => expect(screen.getByTestId('place-error')).toBeTruthy())
    expect(screen.getByTestId('place-error').textContent).not.toMatch(/kit\[|\[\d|corridor/)
  })

  it('plainRefusal never carries list positions or coordinates', () => {
    for (const s of [422, 409, 500]) expect(plainRefusal('x: kit[3].at[1]: 5', ['kit[3].at[1]: 5 is outside -150..150'], s)).not.toMatch(/kit\[|\d/)
  })
})
