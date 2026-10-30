// @vitest-environment jsdom
// The Stage's Walk to a spot (the Person panel's "Where she goes"): press it, click the ground, she walks from her mark to the
// spot; Slow walk / Walk / Run set pace and gait; Stay put takes the walk away; the take length rides through every save.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlan } from '../../../../stage3d/contract'
import { BATTLEFIELD } from '../../../../stage3d/presets'
import { markOf } from '../../../../stage3d/mark'
import { standPath } from '../../../../stage3d/motion/standPlan'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import { useSetPlace } from '../../../scene/useSetPlace'
import { isGroundDrawing } from '../../groundDrawing'
import { walkMarks } from '../../walkMarks'
import { armWalk, holdWalk } from '../../walkArm'
import { StagePanel } from '../StagePanel'

// the ground click is the viewport's (a raycast); the test plays the click by calling the callback the panel handed over
let click: ((p: [number, number]) => void) | null = null
vi.mock('../blocking/groundClick', () => ({
  groundHit: () => null,
  useGroundClick: (_stage: unknown, cb: (p: [number, number]) => void) => { click = cb },
}))

const ID = 'loc-2026-10-23T03-00-01-000'
const PLAN: ScenePlan = BATTLEFIELD
const MARK = markOf(PLAN)
const STAND = standPath(MARK)
const world = (perf: KitWorld['perf']): KitWorld => ({ id: ID, description: 'd', plan: PLAN, perf, still: null, createdAt: '' })
const lab = (w: KitWorld) => ({ kit: { id: w.id, world: w, layer: null, perf: w.perf, error: null }, stage: {} }) as unknown as ProjectionLabState

afterEach(() => { cleanup(); click = null; vi.unstubAllGlobals(); vi.restoreAllMocks() })

function stubFetch(w: KitWorld) {
  const saves: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (url.startsWith('/__lab/stage3d/performance')) saves.push(body)
    return url.startsWith('/__lab/bible')
      ? new Response(JSON.stringify({ bible: null }), { status: 200 })
      : new Response(JSON.stringify({ ...w, perf: body ?? w.perf }), { status: 200 })
  }))
  return saves
}

function mount(w: KitWorld) {
  function Host() {
    const place = useSetPlace(w)
    return <StagePanel lab={lab(w)} pick={{ t: 'mark' }} select={vi.fn()} place={place} />
  }
  render(<Host />)
}
const spotAt = (p: [number, number]) => { fireEvent.click(screen.getByTestId('walk-to')); act(() => click!(p)) }
const lastSave = (saves: Record<string, unknown>[]) => saves[saves.length - 1]

describe('Walk to a spot', () => {
  it('is one plain button; no speed or distance until a spot is picked', () => {
    stubFetch(world({ path: STAND, stand: true }))
    mount(world({ path: STAND, stand: true }))
    expect(screen.getByTestId('walk-to').textContent).toBe('Walk to a spot')
    for (const hidden of ['walk-speed', 'walk-line', 'walk-stay', 'walk-armed']) expect(screen.queryByTestId(hidden)).toBeNull()
  })

  it('pressing it arms the ground pick (Esc disarms) and keeps the Add menu off the click', () => {
    stubFetch(world({ path: STAND, stand: true }))
    mount(world({ path: STAND, stand: true }))
    fireEvent.click(screen.getByTestId('walk-to'))
    expect(screen.getByTestId('walk-armed').textContent).toContain('Click the spot')
    expect(screen.getByTestId('walk-to').textContent).toBe('Cancel')
    expect(isGroundDrawing()).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('walk-armed')).toBeNull()
    expect(isGroundDrawing()).toBe(false)
  })

  it('a click on the ground saves a walk from her mark to the spot at a plain walk, keeping the take length', async () => {
    const w = world({ path: STAND, stand: true, shotSeconds: 6 })
    const saves = stubFetch(w)
    mount(w)
    spotAt([MARK.at[0] + 4, MARK.at[1] - 3])
    await waitFor(() => expect(saves.length).toBe(1), { timeout: 3000 })
    expect(lastSave(saves)).toMatchObject({ path: [MARK.at, [MARK.at[0] + 4, MARK.at[1] - 3]], pace: 0.8, shotSeconds: 6 })
    expect(lastSave(saves).stand).toBeUndefined()
    expect(screen.getByTestId('walk-line').textContent).toContain('5.0 m')
    expect(screen.getByTestId('walk-line').textContent).toContain('in a 6 s take they cover about 6 m')
    expect(screen.queryByTestId('walk-armed')).toBeNull() // one click, one spot
  })

  it('Run and Slow walk change the pace and gait; the reach follows the pace', async () => {
    const w = world({ path: [MARK.at, [MARK.at[0], MARK.at[1] - 5]], pace: 0.8, shotSeconds: 4 })
    const saves = stubFetch(w)
    mount(w)
    expect(screen.getByTestId('walk-speed-walk').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('walk-speed-run'))
    await waitFor(() => expect(lastSave(saves)).toMatchObject({ pace: 1, gait: 'run', shotSeconds: 4 }), { timeout: 3000 })
    expect(screen.getByTestId('walk-speed-run').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('walk-speed-slow'))
    await waitFor(() => expect(lastSave(saves)).toMatchObject({ pace: 0.6, gait: 'walk' }), { timeout: 3000 })
    expect(screen.getByTestId('walk-line').textContent).toContain('cover about 3 m')
  })

  it('a spot on top of her start is not a walk: it says so and saves nothing', async () => {
    const saves = stubFetch(world({ path: STAND, stand: true }))
    mount(world({ path: STAND, stand: true }))
    spotAt([MARK.at[0] + 0.2, MARK.at[1]])
    expect(screen.getByTestId('walk-near').textContent).toContain('farther away')
    await new Promise((r) => setTimeout(r, 800))
    expect(saves.length).toBe(0)
  })

  it('a walk longer than the take says the take keeps only the first seconds', () => {
    const w = world({ path: [MARK.at, [MARK.at[0], MARK.at[1] - 10]], shotSeconds: 4 })
    stubFetch(w)
    mount(w)
    expect(screen.getByTestId('walk-over').textContent).toContain('need about 10 s')
    expect(screen.getByTestId('walk-over').textContent).toContain('A take keeps the first 4 s')
  })

  it('no warning while she gets there in time (Run fixes a long walk)', async () => {
    const w = world({ path: [MARK.at, [MARK.at[0], MARK.at[1] - 10]], shotSeconds: 4 })
    stubFetch(w)
    mount(w)
    expect(screen.queryByTestId('walk-over')).not.toBeNull()
    fireEvent.click(screen.getByTestId('walk-speed-run'))
    await waitFor(() => expect(screen.queryByTestId('walk-over')).toBeNull())
  })

  it('Stay put takes the walk away: she stands on the mark again, take length kept', async () => {
    const w = world({ path: [MARK.at, [MARK.at[0] + 3, MARK.at[1]]], shotSeconds: 6 })
    const saves = stubFetch(w)
    mount(w)
    fireEvent.click(screen.getByTestId('walk-stay'))
    await waitFor(() => expect(lastSave(saves)).toMatchObject({ path: STAND, stand: true, shotSeconds: 6 }), { timeout: 3000 })
  })

  it('the walk is shown on the viewport while the panel is up: the click publishes her start and the spot at once', () => {
    stubFetch(world({ path: STAND, stand: true }))
    mount(world({ path: STAND, stand: true }))
    expect(walkMarks()).toBeNull() // standing: nothing to draw
    spotAt([MARK.at[0] + 4, MARK.at[1] - 3])
    expect(walkMarks()).toEqual([MARK.at, [MARK.at[0] + 4, MARK.at[1] - 3]]) // before the save lands
    cleanup() // the person let go: the panel goes, and the marks with it
    expect(walkMarks()).toBeNull()
  })

  it('Stay put takes the marks away with the walk', async () => {
    const w = world({ path: [MARK.at, [MARK.at[0] + 3, MARK.at[1]]], shotSeconds: 6 })
    stubFetch(w)
    mount(w)
    expect(walkMarks()).toEqual([MARK.at, [MARK.at[0] + 3, MARK.at[1]]])
    fireEvent.click(screen.getByTestId('walk-stay'))
    await waitFor(() => expect(walkMarks()).toBeNull())
  })

  it('a made move can still be described once she has a walk', () => {
    const w = world({ path: [MARK.at, [MARK.at[0], MARK.at[1] - 4]] })
    stubFetch(w)
    mount(w)
    expect(screen.getByTestId('move-words')).toBeTruthy()
  })
})

describe("the right-click menu's walk presses (walkArm)", () => {
  it('Walk to a spot / Slow walk / Run arm THIS tool at that pace: the armed pick shows, the draft saves the gait', async () => {
    const w = world({ path: STAND, stand: true, shotSeconds: 6 })
    const saves = stubFetch(w)
    mount(w)
    act(() => armWalk('run'))
    expect(screen.getByTestId('walk-armed').textContent).toContain('Click the spot') // the panel's own picker and overlay
    expect(isGroundDrawing()).toBe(true)
    await waitFor(() => expect(lastSave(saves)).toMatchObject({ pace: 1, gait: 'run' }), { timeout: 3000 })
    act(() => armWalk('slow'))
    await waitFor(() => expect(lastSave(saves)).toMatchObject({ pace: 0.6, gait: 'walk' }), { timeout: 3000 })
  })

  it('a menu walk press is the same walk: clicking the ground saves the walk from her mark', async () => {
    const w = world({ path: STAND, stand: true, shotSeconds: 6 })
    const saves = stubFetch(w)
    mount(w)
    act(() => armWalk('walk'))
    act(() => click!([MARK.at[0] + 4, MARK.at[1] - 3]))
    await waitFor(() => expect(lastSave(saves)).toMatchObject({ path: [MARK.at, [MARK.at[0] + 4, MARK.at[1] - 3]], pace: 0.8 }), { timeout: 3000 })
  })

  it('Hold here is Stay put: she stands on the mark again, the take length kept', async () => {
    const w = world({ path: [MARK.at, [MARK.at[0] + 3, MARK.at[1]]], shotSeconds: 6 })
    const saves = stubFetch(w)
    mount(w)
    act(() => holdWalk())
    await waitFor(() => expect(lastSave(saves)).toMatchObject({ path: STAND, stand: true, shotSeconds: 6 }), { timeout: 3000 })
  })

  it('a menu press with no walk tool mounted is a safe no-op', () => {
    expect(() => { armWalk('run'); holdWalk() }).not.toThrow()
  })
})
