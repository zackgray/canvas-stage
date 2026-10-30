// @vitest-environment jsdom
// The lift's hive belongs to the set (wiring, 2026-10-25): a lift added beside a hive of the set lifts from it (her point moves to
// stand at it, facing it; no second hive, no "walks through" warning for it); with none near, the hive the lift brings is drawn on
// Blocking's and the Set's top views and counted in the Set's thin-set check.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitWorld } from '../../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../../labs/projection/useProjectionLab'
import type { KitItem, ScenePlan } from '../../../../../stage3d/contract'
import { halfSize, isHivePiece, LIFT_REACH, liftSpots, standBy } from '../../../../../stage3d/props/liftSpots'
import { SetPlace } from '../../../../scene/SetPlace'
import { viewBox } from '../blockingMath'
import { BlockingPanel } from '../index'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const ID = 'loc-2026-10-25T10-00-00-000'
const HIVE: KitItem = { kind: 'crates', args: [7, 1], at: [1.6, -8], label: 'a white-painted hive', pieceTag: 'prop:hive', scale: 1.4 }
const plan = (kit: KitItem[]): ScenePlan => ({ seed: 1, flat: [-3, -16, 3, 8], sky: { url: '/lab-assets/sky/procedural' }, kit: [...kit, { kind: 'tree', at: [-9, -14] }] })
const PATH: [number, number][] = [[0.6, -12.5], [0.6, -8.5]]
const worldOf = (kit: KitItem[], actions?: KitWorld['perf']['actions']): KitWorld => ({ id: ID, description: 'd', plan: plan(kit), perf: { path: PATH, pace: 0.8, ...(actions ? { actions } : {}) }, still: null, createdAt: '' })
const lab = (w: KitWorld) => ({ kit: { id: w.id, world: w, layer: null, perf: w.perf, error: null } }) as unknown as ProjectionLabState

function clickGround(w: KitWorld, x: number, z: number) {
  const box = viewBox(w.plan, [PATH]), svg = screen.getByTestId('blocking-top-view')
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: (box[2] - box[0]) * 10, height: (box[3] - box[1]) * 10 } as DOMRect)
  fireEvent.click(svg, { clientX: (x - box[0]) * 10, clientY: (z - box[1]) * 10 })
}
const mountBlocking = async (w: KitWorld) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ bible: null }), { status: 200 })))
  render(<BlockingPanel lab={lab(w)} />)
  await waitFor(() => expect(screen.getByTestId('blocking-top-view')).toBeTruthy())
}

describe('where a lift\'s hive is', () => {
  it('a hive of the set is known by its own words; she stands at its edge on the line from where she came, facing it', () => {
    expect(isHivePiece(HIVE)).toBe(true)
    expect(isHivePiece({ kind: 'crates', label: 'a stack of crates' })).toBe(false)
    expect(isHivePiece({ kind: 'barrels', pieceTag: 'prop:beehive' })).toBe(true)
    const s = standBy({ ...HIVE, at: [0, -10] }, [0, -4])
    expect(s[0]).toBeCloseTo(0, 6)
    expect(-10 - s[1]).toBeLessThan(0) // on her side of it
    expect(Math.abs(s[1] + 10)).toBeCloseTo(halfSize(HIVE) + 0.15, 1)
  })
  it('the lift\'s own hive is ahead of her point the way she walks; a set hive there stands in for it', () => {
    const [own] = liftSpots(PATH, [{ kind: 'lift', at: 4 }], [])
    expect(own.piece).toBe(-1)
    expect(own.at[0]).toBeCloseTo(0.6, 6); expect(own.at[1]).toBeCloseTo(-8.5 + LIFT_REACH, 6) // she walks toward +z here
    expect(liftSpots(PATH, [{ kind: 'lift', at: 4 }], [{ ...HIVE, at: [0.6, -7.9] }])[0].piece).toBe(0)
    expect(liftSpots(PATH, [{ kind: 'stop', at: 4 }], [])).toEqual([])
  })
})

describe('Blocking: Lift a frame beside the set\'s hive', () => {
  it('moves her point to stand at the set\'s hive, says so, brings no hive of its own and warns of no walk-through', async () => {
    const w = worldOf([HIVE])
    await mountBlocking(w)
    clickGround(w, 0.6, -8.5)
    fireEvent.click(screen.getByTestId('blocking-action-add-lift'))
    expect(screen.getByTestId('blocking-note').textContent).toMatch(/lifts from the set's a white-painted hive: that point moved to stand at it/)
    const end = screen.getByTestId('blocking-path-1'), [ex, ez] = [Number(end.getAttribute('cx')), Number(end.getAttribute('cy'))]
    const [sx, sz] = standBy(HIVE, PATH[0])
    expect([ex, ez]).toEqual([sx, sz])
    expect(Math.hypot(ex - HIVE.at[0], ez - HIVE.at[1])).toBeLessThan(Math.hypot(PATH[1][0] - HIVE.at[0], PATH[1][1] - HIVE.at[1]))
    expect(screen.queryByTestId('lift-hive-0')).toBeNull()
    expect(screen.queryByTestId('blocking-through-warning')).toBeNull()
  })
  it('with no hive in the set: her point stays and the hive the lift brings is drawn on the map', async () => {
    const w = worldOf([])
    await mountBlocking(w)
    clickGround(w, 0.6, -8.5)
    fireEvent.click(screen.getByTestId('blocking-action-add-lift'))
    expect(screen.getByTestId('blocking-path-1').getAttribute('cy')).toBe('-8.5')
    expect(screen.getByTestId('lift-hive-0').textContent).toMatch(/hive \(with the lift\)/)
  })
})

describe('the Set\'s top view sees the lift\'s hive', () => {
  it('drawn and counted in the thin-set check when the set has none; nothing extra when the set\'s hive serves the lift', () => {
    render(<SetPlace world={worldOf([], [{ kind: 'lift', at: 4 }])} api={{ edit: vi.fn(), add: vi.fn(), mark: vi.fn() }} />)
    expect(screen.getByTestId('lift-hive-0')).toBeTruthy()
    expect(screen.getByTestId('set-thin').textContent).toMatch(/only 2 pieces are in the master view/) // the tree and the lift's hive
    cleanup()
    render(<SetPlace world={worldOf([{ ...HIVE, at: [0.6, -7.9] }], [{ kind: 'lift', at: 4 }])} api={{ edit: vi.fn(), add: vi.fn(), mark: vi.fn() }} />)
    expect(screen.queryByTestId('lift-hive-0')).toBeNull()
    expect(screen.getByTestId('set-thin').textContent).toMatch(/only 2 pieces are in the master view/) // the tree and the set's hive, once
  })
})
