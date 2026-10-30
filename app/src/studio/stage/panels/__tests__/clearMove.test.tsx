// @vitest-environment jsdom
// Clear move (owner 2026-10-29: a prop stuck with a saved move and no way to cancel it, since a click no longer opens its card).
// The right-click menu offers Clear move only while the piece has a saved move; the piece panel says it moves (how far, how fast)
// with its own Clear move; both do exactly the card's Clear path: the travel tool lets go and the move is written null through the
// Set's own piece route, the piece staying where it stands. A refusal is said in plain words; an armed Move to a spot lets go when
// the pick changes (it never reappears later on another piece); Esc still cancels while arming.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlan } from '../../../../stage3d/contract'
import { BATTLEFIELD } from '../../../../stage3d/presets'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { PlaceApi } from '../../../scene/setPlaceApi'
import { useSetPlace } from '../../../scene/useSetPlace'
import { isGroundDrawing } from '../../groundDrawing'
import type { StageMark } from '../../railBus'
import { StagePanel } from '../StagePanel'
import type { StagePick } from '../../useStagePick'

vi.mock('../blocking/groundClick', () => ({ groundHit: () => null, useGroundClick: () => {} }))

const ID = 'loc-2026-10-23T03-00-01-000'
const AT = BATTLEFIELD.kit[0].at as [number, number]
const MOVE = { path: [AT, [AT[0] + 3, AT[1] + 4]] as [number, number][], speed: 2 }
const planWith = (move?: typeof MOVE): ScenePlan => ({ ...BATTLEFIELD, kit: [{ ...BATTLEFIELD.kit[0], ...(move ? { move } : {}) }, ...BATTLEFIELD.kit.slice(1)] })
const world = (plan: ScenePlan): KitWorld => ({ id: ID, description: 'd', plan, perf: { path: [[0, 0]] }, still: null, createdAt: '' } as unknown as KitWorld)
const canvas = document.createElement('canvas')
document.body.appendChild(document.createElement('div')).appendChild(canvas)
const lab = (w: KitWorld) => ({ kit: { id: w.id, world: w, layer: null, perf: w.perf, error: null }, stage: { renderer: { domElement: canvas } } }) as unknown as ProjectionLabState
const api = (fail?: string): PlaceApi & { edit: ReturnType<typeof vi.fn> } => ({
  edit: vi.fn(async () => { if (fail) throw new Error(fail) }), add: vi.fn(async () => {}), mark: vi.fn(async () => {}), move: vi.fn(async () => {}),
})
const pieceMenu: StageMark = { at: AT, px: { x: 30, y: 30 }, kind: null, piece: { index: 0, swap: true } }

afterEach(() => { cleanup(); vi.restoreAllMocks() })

let setPick: (p: StagePick | null) => void = () => {}
function mount(w: KitWorld, a: PlaceApi, menu: StageMark | null = null, chooseMenu = vi.fn()) {
  function Host() {
    const place = useSetPlace(w, a)
    const [pick, set] = useState<StagePick | null>({ t: 'piece', index: 0 })
    setPick = set
    useEffect(() => { place.setSel(pick?.t === 'piece' ? pick.index : null) })
    return <StagePanel lab={lab(w)} pick={pick} select={vi.fn()} place={place} menu={menu} chooseMenu={chooseMenu} />
  }
  render(<Host />)
  return chooseMenu
}

describe('Clear move', () => {
  it('the menu offers it only while the piece has a saved move; it writes the move null through the piece route', async () => {
    mount(world(planWith()), api(), pieceMenu)
    expect(screen.queryByTestId('stage-menu-clear-move')).toBeNull()
    cleanup()
    const a = api()
    const chooseMenu = mount(world(planWith(MOVE)), a, pieceMenu)
    fireEvent.click(screen.getByTestId('stage-menu-clear-move'))
    expect(chooseMenu).toHaveBeenCalledWith({ do: 'close' })
    await waitFor(() => expect(a.edit).toHaveBeenCalledWith(ID, 0, BATTLEFIELD.kit[0].kind, { move: null }))
  })

  it('the piece panel says it moves, with its own Clear move; a refusal is said in plain words', async () => {
    mount(world(planWith()), api())
    await screen.findByTestId('piece-panel')
    expect(screen.queryByTestId('piece-move')).toBeNull()
    cleanup()
    const a = api('the set changed in another tab')
    mount(world(planWith(MOVE)), a)
    expect((await screen.findByTestId('piece-move')).textContent).toMatch(/moves along a path: 5 m at 2 m\/s/)
    fireEvent.click(screen.getByTestId('piece-move-clear'))
    await waitFor(() => expect(a.edit).toHaveBeenCalledWith(ID, 0, BATTLEFIELD.kit[0].kind, { move: null }))
    expect((await screen.findByTestId('piece-error')).textContent).toMatch(/path was not saved: the set changed in another tab/)
  })

  it('an armed Move to a spot lets go when the pick changes; Esc still cancels while arming', async () => {
    const chooseMenu = vi.fn()
    mount(world(planWith()), api(), pieceMenu, chooseMenu)
    fireEvent.click(screen.getByTestId('stage-menu-move-spot'))
    expect(isGroundDrawing()).toBe(true)
    act(() => setPick(null)) // the owner let go of the piece mid-arming
    await waitFor(() => expect(isGroundDrawing()).toBe(false))
    act(() => setPick({ t: 'piece', index: 0 }))
    await new Promise((r) => setTimeout(r, 50))
    expect(isGroundDrawing()).toBe(false) // it does not come back on its own
    fireEvent.click(screen.getByTestId('stage-menu-move-spot'))
    expect(isGroundDrawing()).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(isGroundDrawing()).toBe(false)
  })
})
