// @vitest-environment jsdom
// Track C: the Set's top view composes the scene from its pieces: every piece is dragged (the existing drag, saved through the
// piece route), turned, scaled and removed (and put back), a kit shape can be added, and the subject's mark is dragged and
// saved. Each change is one save call to the world's own routes, which rewrite the plan (server/stage3d/__tests__/pieceEdit.test.ts).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitWorld } from '../../../labs/projection/stage3d/kitApi'
import type { ScenePlan } from '../../../stage3d/contract'
import { markOf } from '../../../stage3d/mark'
import { viewBox } from '../../stage/panels/blocking/blockingMath'
import { SetPlace } from '../SetPlace'
import type { PlaceApi } from '../setPlaceApi'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const ID = 'loc-2026-10-25T10-00-00-000'
const plan: ScenePlan = { seed: 1, flat: [-3, -16, 3, 8], sky: { url: '/lab-assets/sky/procedural' }, kit: [
  { kind: 'crates', args: [1, 1], at: [6, -8], label: 'white-painted hive', pieceTag: 'prop:hive', scale: 1.5 },
  { kind: 'tree', at: [-9, -14], yawDeg: 30 },
] }
const world: KitWorld = { id: ID, description: 'd', plan, perf: { path: [[0.6, -12.5], [0.6, -8]], pace: 0.8 }, still: null, createdAt: '' }
const fakeApi = (): PlaceApi => ({ edit: vi.fn(async () => {}), add: vi.fn(async () => {}), mark: vi.fn(async () => {}) })

function mount(api = fakeApi(), w: KitWorld | null = world) {
  render(<SetPlace world={w} api={api} />)
  if (!w) return { api }
  const svg = screen.getByTestId('blocking-top-view') as unknown as SVGSVGElement
  const box = viewBox(plan, [world.perf.path])
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: (box[2] - box[0]) * 10, height: (box[3] - box[1]) * 10 } as DOMRect)
  const px = (x: number, z: number) => ({ clientX: (x - box[0]) * 10, clientY: (z - box[1]) * 10, pointerId: 1 })
  return { api, px }
}
const pick = (i: number) => { const h = screen.getByTestId(`piece-drag-${i}`); fireEvent.pointerDown(h, { clientX: 1, clientY: 1, pointerId: 1 }); fireEvent.pointerUp(h, { clientX: 1, clientY: 1, pointerId: 1 }) }

describe('SetPlace', () => {
  it('shows every piece with its own words, the mark, and nothing when there is no set', () => {
    mount()
    expect(screen.getByTestId('piece-drag-0')).toBeTruthy()
    expect(screen.getByTestId('piece-drag-1')).toBeTruthy()
    expect(screen.getByTestId('set-label-0').textContent).toBe('white-painted hive')
    expect(screen.getByTestId('set-mark-body').getAttribute('cx')).toBe('0.6') // the corridor start: no mark was saved
    cleanup(); render(<SetPlace world={null} />)
    expect(screen.queryByTestId('set-place')).toBeNull()
  })

  it('a thin set says so plainly (a warning from the plan as it stands, never a block); a full set or an interior does not', () => {
    mount()
    expect(screen.getByTestId('set-thin').textContent).toMatch(/only 2 pieces are in the master view/)
    cleanup()
    const full = { ...plan, kit: Array.from({ length: 6 }, (_, i) => ({ kind: 'tree', at: [i - 3, -12 - i] as [number, number] })) }
    render(<SetPlace world={{ ...world, plan: full }} api={fakeApi()} />)
    expect(screen.queryByTestId('set-thin')).toBeNull()
    cleanup()
    render(<SetPlace world={{ ...world, plan: { ...plan, sky: { ...plan.sky, look: 'interior' } } }} api={fakeApi()} />)
    expect(screen.queryByTestId('set-thin')).toBeNull()
  })

  it('labels stay readable: every prop keeps its label, a planner piece right beside another labelled one shows none until picked', () => {
    const grove = { ...plan, kit: [...plan.kit, { kind: 'tree', at: [-8, -14] as [number, number], label: 'apple tree' }, { kind: 'tree', at: [-6, -13.5] as [number, number], label: 'apple tree' }] }
    render(<SetPlace world={{ ...world, plan: grove }} api={fakeApi()} />)
    expect(screen.getByTestId('set-label-0').textContent).toBe('white-painted hive')
    expect(screen.queryByTestId('set-label-2')).toBeTruthy()
    expect(screen.queryByTestId('set-label-3')).toBeNull() // it would print over the one beside it
  })

  it('a piece is dragged to a new place through the piece route (the save the Blocking drag makes)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { px } = mount()
    const h = screen.getByTestId('piece-drag-1')
    fireEvent.pointerDown(h, px!(-9, -14)); fireEvent.pointerMove(h, px!(-12, -16))
    await act(async () => { fireEvent.pointerUp(h, px!(-12, -16)) })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/__lab/stage3d/piece?id=${ID}`)
    expect(JSON.parse(String(init.body))).toEqual({ index: 1, kind: 'tree', at: [-12, -16], yawDeg: 30 })
  })

  it('the picked piece is resized, turned a step and removed, each one save call; with none picked the buttons are not there', async () => {
    const { api } = mount()
    expect(screen.queryByTestId('place-remove')).toBeNull()
    pick(0)
    expect(screen.getByTestId('place-scale').textContent).toBe('150%')
    await act(async () => { fireEvent.click(screen.getByTestId('place-larger')) })
    expect(api.edit).toHaveBeenLastCalledWith(ID, 0, 'crates', { scale: 1.58 })
    await act(async () => { fireEvent.click(screen.getByTestId('place-smaller')) })
    expect(api.edit).toHaveBeenLastCalledWith(ID, 0, 'crates', { scale: 1.43 })
    await act(async () => { fireEvent.click(screen.getByTestId('place-turn-right')) })
    expect(api.edit).toHaveBeenLastCalledWith(ID, 0, 'crates', { yawDeg: 5 })
    await act(async () => { fireEvent.click(screen.getByTestId('place-remove')) })
    expect(api.edit).toHaveBeenLastCalledWith(ID, 0, 'crates', { remove: true })
    expect(screen.queryByTestId('place-remove')).toBeNull() // nothing is picked any more
  })

  it('a removed piece comes back whole with one press; an added kit shape is one add call', async () => {
    const { api } = mount()
    pick(1)
    await act(async () => { fireEvent.click(screen.getByTestId('place-remove')) })
    await act(async () => { fireEvent.click(screen.getByTestId('place-undo')) })
    expect(api.add).toHaveBeenLastCalledWith(ID, plan.kit[1])
    expect(screen.queryByTestId('place-undo')).toBeNull()
    fireEvent.change(screen.getByTestId('place-kind'), { target: { value: 'rock' } })
    await act(async () => { fireEvent.click(screen.getByTestId('place-add')) })
    expect(api.add).toHaveBeenLastCalledWith(ID, { kind: 'rock' })
  })

  it("a refusal is said in words beside the buttons and nothing else changes", async () => {
    const api = fakeApi()
    ;(api.edit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('the set would not be valid after this change'))
    mount(api)
    pick(0)
    await act(async () => { fireEvent.click(screen.getByTestId('place-remove')) })
    expect(screen.getByTestId('place-error').textContent).toMatch(/crates was not removed: the set would not be valid/)
    expect(screen.queryByTestId('place-undo')).toBeNull()
  })

  it('the mark is dragged and saved once with its place and facing; a press without a move saves nothing', async () => {
    const { api, px } = mount()
    const m = screen.getByTestId('set-mark-body')
    fireEvent.pointerDown(m, px!(0.6, -12.5)); fireEvent.pointerUp(m, px!(0.6, -12.5))
    expect(api.mark).not.toHaveBeenCalled()
    fireEvent.pointerDown(m, px!(0.6, -12.5)); fireEvent.pointerMove(m, px!(4, -10))
    expect(m.getAttribute('cx')).toBe('4') // drawn where it is being dragged
    await act(async () => { fireEvent.pointerUp(m, px!(4, -10)) })
    expect(api.mark).toHaveBeenCalledTimes(1)
    expect(api.mark).toHaveBeenCalledWith(ID, [4, -10], markOf({ ...plan, mark: { at: [4, -10] } }).yawDeg) // no saved facing: it faces the nearest prop from the new place
    const k = screen.getByTestId('set-mark-turn')
    fireEvent.pointerDown(k, px!(4, -8.6)); fireEvent.pointerMove(k, px!(8, -10))
    await act(async () => { fireEvent.pointerUp(k, px!(8, -10)) })
    expect(api.mark).toHaveBeenLastCalledWith(ID, [4, -10], 90)
  })
})
