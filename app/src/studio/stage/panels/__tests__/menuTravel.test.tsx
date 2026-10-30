// @vitest-environment jsdom
// The viewport right-click menu's 'Move to a spot' (W3-E2): the SAME travel logic the prop card's Advanced tab uses
// (usePropTravel — one flow, one save route), with a single spot. The menu press arms the spot picker, the next ground click
// saves the piece's path through the Set's own piece route (the same place.setMove PropAdvanced presses), and Esc cancels.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlan } from '../../../../stage3d/contract'
import { BATTLEFIELD } from '../../../../stage3d/presets'
import { markOf } from '../../../../stage3d/mark'
import { standPath } from '../../../../stage3d/motion/standPlan'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { PlaceApi } from '../../../scene/setPlaceApi'
import { useSetPlace } from '../../../scene/useSetPlace'
import { isGroundDrawing } from '../../groundDrawing'
import type { StageMark } from '../../railBus'
import { StagePanel } from '../StagePanel'

// the ground click is the viewport's (a raycast); the test plays the click by calling the callback the picker handed over
let click: ((p: [number, number]) => void) | null = null
vi.mock('../blocking/groundClick', () => ({
  groundHit: () => null,
  useGroundClick: (_stage: unknown, cb: (p: [number, number]) => void) => { click = cb },
}))

const ID = 'loc-2026-10-23T03-00-01-000'
const PLAN: ScenePlan = BATTLEFIELD
const MARK = markOf(PLAN)
const STAND = standPath(MARK)
const AT = PLAN.kit[0].at as [number, number]
const world = (perf: KitWorld['perf']): KitWorld => ({ id: ID, description: 'd', plan: PLAN, perf, still: null, createdAt: '' })
const canvas = document.createElement('canvas')
const host = document.createElement('div')
host.appendChild(canvas)
document.body.appendChild(host)
const lab = (w: KitWorld) => ({ kit: { id: w.id, world: w, layer: null, perf: w.perf, error: null }, stage: { renderer: { domElement: canvas } } }) as unknown as ProjectionLabState

afterEach(() => { cleanup(); click = null; vi.unstubAllGlobals(); vi.restoreAllMocks() })

const api = (): PlaceApi & { edit: ReturnType<typeof vi.fn> } => ({
  edit: vi.fn(async () => {}),
  add: vi.fn(async () => {}),
  mark: vi.fn(async () => {}),
  move: vi.fn(async () => {}),
})

const menu: StageMark = { at: AT, px: { x: 30, y: 30 }, kind: null, piece: { index: 0, swap: true } }

function mount(w: KitWorld, a: PlaceApi, chooseMenu = vi.fn()) {
  function Host() {
    const place = useSetPlace(w, a)
    useEffect(() => { place.setSel(0) }) // one selection press; the same value never re-renders
    return <StagePanel lab={lab(w)} pick={{ t: 'piece', index: 0 }} select={vi.fn()} place={place}
      menu={menu} chooseMenu={chooseMenu} />
  }
  render(<Host />)
  return chooseMenu
}

describe("the menu's Move to a spot (the card Advanced tab's own travel flow)", () => {
  it('the press arms the pick: the menu closes and the next ground click saves a one-spot path through the piece route', async () => {
    const a = api()
    const chooseMenu = mount(world({ path: STAND, stand: true }), a)
    fireEvent.click(screen.getByTestId('stage-menu-move-spot'))
    expect(chooseMenu).toHaveBeenCalledWith({ do: 'close' }) // the menu hands over to the pick
    expect(isGroundDrawing()).toBe(true) // the click belongs to the spot picker now
    act(() => click!([AT[0] + 2, AT[1] - 3]))
    await waitFor(() => expect(a.edit).toHaveBeenCalledWith(ID, 0, PLAN.kit[0].kind,
      { move: { path: [AT, [AT[0] + 2, AT[1] - 3]], speed: 3 } }))
    expect(isGroundDrawing()).toBe(false) // one click, one save
  })

  it('a spot right on the piece is still saved (unlike a walk, a travel may be a nudge): the path rounds through it', async () => {
    const a = api()
    mount(world({ path: STAND, stand: true }), a)
    fireEvent.click(screen.getByTestId('stage-menu-move-spot'))
    act(() => click!([AT[0] + 0.2, AT[1]]))
    await waitFor(() => expect(a.edit).toHaveBeenCalledWith(ID, 0, PLAN.kit[0].kind,
      { move: { path: [AT, [AT[0] + 0.2, AT[1]]], speed: 3 } }))
  })

  it('Edit look opens the card, not the picker: the menu closes and no ground click is armed', () => {
    // a prop piece (a tagged one) is the one whose menu carries Edit look
    const plan = { ...PLAN, kit: [{ ...PLAN.kit[0], pieceTag: 'prop:red-coupe' }, ...PLAN.kit.slice(1)] }
    const w: KitWorld = { id: ID, description: 'd', plan, perf: { path: STAND, stand: true }, still: null, createdAt: '' }
    mount(w, api())
    fireEvent.click(screen.getByTestId('stage-menu-edit-look'))
    expect(isGroundDrawing()).toBe(false) // nothing to pick: the card opens instead (the card body needs the scene providers)
  })

  it('Esc cancels: no save, the picker lets go', async () => {
    const a = api()
    mount(world({ path: STAND, stand: true }), a)
    fireEvent.click(screen.getByTestId('stage-menu-move-spot'))
    expect(isGroundDrawing()).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(isGroundDrawing()).toBe(false)
    await new Promise((r) => setTimeout(r, 700))
    expect(a.edit).not.toHaveBeenCalled()
  })
})
