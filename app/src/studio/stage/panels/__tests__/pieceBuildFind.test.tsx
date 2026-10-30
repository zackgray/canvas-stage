// @vitest-environment jsdom
// "Find a piece" on the set panel: every piece of the set by name with its distance from the performer's mark. The planner can
// stand a prop 25-35 m out where neither view shows it; Select picks it (its panel opens, the gizmo is on it) and Bring near moves
// it to a spot just in front of the performer (the piece route's own save, as a drag). Collapsed to a count until opened; nothing
// paid. (The old "Build this in 3D" coverage of this file moved with the press into the prop card, propCard.test.tsx.)
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { PlaceApi } from '../../../scene/setPlaceApi'
import { useSetPlace } from '../../../scene/useSetPlace'
import { ID, plan, world0 } from '../../__tests__/liveFakes'
import { FindPieces } from '../FindPieces'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

const farPlan = { ...plan, kit: [...plan.kit, { kind: 'crates', at: [2, -45], label: 'locomotive', pieceTag: 'prop:loco' }] }
const world: KitWorld = { ...world0, plan: farPlan as KitWorld['plan'] }
const place0 = () => ({ edit: vi.fn(), add: vi.fn(), mark: vi.fn(), label: vi.fn(), swap: vi.fn(), move: vi.fn().mockResolvedValue(undefined) }) as unknown as PlaceApi & { move: ReturnType<typeof vi.fn> }

function mount(placeApi = place0()) {
  const select = vi.fn()
  function Host() {
    const place = useSetPlace(world, placeApi)
    return <FindPieces world={world} place={place} select={select} />
  }
  render(<Host />)
  return { select, placeApi }
}

describe('Find a piece on the set panel', () => {
  it('lists every piece with its distance; Select picks it, Bring near moves a far one next to the performer', async () => {
    const { select, placeApi } = mount()
    fireEvent.click(await screen.findByTestId('find-toggle'))
    expect(screen.getByTestId('find-row-2').textContent).toMatch(/locomotive.*3\d m away \(far\)/)
    expect(screen.queryByTestId('find-bring-0')).toBeNull()
    fireEvent.click(screen.getByTestId('find-select-2'))
    expect(select).toHaveBeenCalledWith({ t: 'piece', index: 2 })
    fireEvent.click(screen.getByTestId('find-bring-2'))
    await waitFor(() => expect(placeApi.move).toHaveBeenCalledWith(ID, 2, 'crates', [0.6, -10], 0))
  })
})
