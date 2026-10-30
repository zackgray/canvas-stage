// @vitest-environment jsdom
// The Stage's Person panel (the Stage simplification): the mark pick routes to it. Where she stands: Turn left / Turn right save
// the mark's facing (the plain angle control), Face the <prop> turns her to a piece the owner placed (a kit piece with its own
// pieceTag — the planner's generic pieces are never offered, hide-set-build). What she does: one action (Describe a move while
// there is none), listed with its seconds and a ×; Clear her action live-saves her back to standing on the mark. No path, pace,
// gait, extras, creatures or casting rows. Off a kit world it says so.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlan } from '../../../../stage3d/contract'
import { BATTLEFIELD } from '../../../../stage3d/presets'
import { markOf, yawToward } from '../../../../stage3d/mark'
import { standPath } from '../../../../stage3d/motion/standPlan'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import { TURN_STEP, useSetPlace } from '../../../scene/useSetPlace'
import type { StagePick } from '../../useStagePick'
import { StagePanel } from '../StagePanel'

const ID = 'loc-2026-10-23T03-00-01-000'
// a fence the owner placed (its own pieceTag) and a crate the planner placed (no pieceTag, a bare kind)
const PLAN: ScenePlan = { ...BATTLEFIELD, kit: [...BATTLEFIELD.kit, { kind: 'fence', at: [3, -12.5], label: 'hive', pieceTag: 'prop:hive' }, { kind: 'crate', at: [-3, -12.5] }] }
const MARK = markOf(PLAN)
const STAND = standPath(MARK)
const MOVE = { kind: 'move' as const, at: 0, seconds: 3.45, motion: 'gen:take-frame' as const }
const world = (perf: KitWorld['perf']): KitWorld => ({ id: ID, description: 'd', plan: PLAN, perf, still: null, createdAt: '' })
const lab = (w: KitWorld | null) => ({ kit: { id: w?.id ?? null, world: w, layer: null, perf: w?.perf ?? null, error: null } }) as unknown as ProjectionLabState

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function stubFetch(w: KitWorld) {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, body })
    return url.startsWith('/__lab/bible')
      ? new Response(JSON.stringify({ bible: null }), { status: 200 })
      : new Response(JSON.stringify({ ...w, perf: body ?? w.perf }), { status: 200 })
  }))
  return calls
}
const callTo = (calls: { url: string; body?: Record<string, unknown> }[], route: string) => calls.find((c) => c.url.startsWith(`/__lab/stage3d/${route}`))

function mount(w: KitWorld | null, pick: StagePick = { t: 'mark' }) {
  function Host() {
    const place = useSetPlace(w)
    return <StagePanel lab={lab(w)} pick={pick} select={vi.fn()} place={place} />
  }
  render(<Host />)
}

describe('Person panel', () => {
  it('shows where she stands and what she does, and none of the old blocking rows', async () => {
    stubFetch(world({ path: STAND, stand: true }))
    mount(world({ path: STAND, stand: true }))
    await waitFor(() => expect(screen.getByTestId('person-panel')).toBeTruthy())
    expect(screen.getByTestId('person-turn-left')).toBeTruthy()
    expect(screen.getByTestId('person-face-0').textContent).toBe('Face the hive') // the piece the owner placed
    expect(screen.queryByTestId('person-face-1')).toBeNull() // the planner's crate is never offered
    expect(screen.getByTestId('move-words')).toBeTruthy() // the action box is open whenever she has no action
    for (const gone of ['blocking-panel', 'blocking-pace', 'blocking-gait', 'blocking-hero-mode', 'blocking-extras', 'blocking-cast', 'person-clear', 'person-creature']) {
      expect(screen.queryByTestId(gone)).toBeNull()
    }
  })

  it('Turn right saves the mark turned by one step; Face the hive saves the facing toward it', async () => {
    const calls = stubFetch(world({ path: STAND, stand: true }))
    mount(world({ path: STAND, stand: true }))
    fireEvent.click(screen.getByTestId('person-turn-right'))
    await waitFor(() => expect(callTo(calls, 'mark')?.body).toEqual({ at: MARK.at, yawDeg: MARK.yawDeg + TURN_STEP }))
    calls.length = 0
    fireEvent.click(screen.getByTestId('person-face-0'))
    await waitFor(() => expect(callTo(calls, 'mark')?.body).toEqual({ at: MARK.at, yawDeg: yawToward(MARK.at, [3, -12.5]) }))
  })

  it('her one action is listed with its seconds and a ×; Clear her action saves her standing on the mark, nothing else', async () => {
    const w = world({ path: STAND, stand: true, shotSeconds: 6, actions: [MOVE] })
    const calls = stubFetch(w)
    mount(w)
    expect(screen.getByTestId('person-action-0').textContent).toContain('3.45 s')
    expect(screen.queryByTestId('move-words')).toBeNull() // one action: clear it to describe another
    fireEvent.click(screen.getByTestId('person-clear'))
    await waitFor(() => expect(callTo(calls, 'performance')?.body).toMatchObject({ path: STAND, stand: true, shotSeconds: 6, actions: [] }), { timeout: 3000 })
  })

  it('off a kit world it says so', () => {
    mount(null)
    expect(screen.getByTestId('person-none').textContent).toContain('kit world')
  })
})
