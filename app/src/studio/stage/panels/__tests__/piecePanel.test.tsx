// @vitest-environment jsdom
// The Piece panel (the Stage simplification): a picked piece routes here from the set panel — its name, Remove (the Set's own
// save) and its exact numbers as a readout. Moving, turning and sizing happen in the view (the gizmo, G / R / S); swap and
// duplicate are on the right-click menu. No words editing, no prompt previews. A refusal is said in plain words.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { OperatorEngine } from '../../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { PiecesApi } from '../../../scene/piecesApi'
import type { PlaceApi } from '../../../scene/setPlaceApi'
import { useSetPlace } from '../../../scene/useSetPlace'
import { fakeApi } from '../../../scene/__tests__/fakes'
import { ID, plan, world0 } from '../../__tests__/liveFakes'
import { StagePanel } from '../StagePanel'

vi.mock('../blocking', () => ({ BlockingPanel: () => <section data-testid="blocking-stub" /> }))

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

/** the lab slice the panel host reads, around a real operator engine, on the faked Set world */
function fakeLab(world: KitWorld = world0) {
  const { api } = fakeApi(null, null, { approved: false })
  const lab = {
    op: { mode: 'operator', setMode: vi.fn(), note: null, engine: new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
    stage: null,
    s: { source: 'synthetic' }, shot: undefined, shots: [], pickSource: vi.fn(),
    kit: { id: ID, world, perf: world.perf, error: null, layer: null },
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
  return { lab, api }
}

/** the panel host with its selection's composing state, the picked piece selected, as the Stage shell wires it */
function mount(index: number, world: KitWorld = world0, api?: PlaceApi, pieces?: PiecesApi) {
  const { lab, api: bible } = fakeLab(world)
  const select = vi.fn()
  function Host() {
    const place = useSetPlace(world, api)
    // the app picks in the viewport, which is the same state: pick the piece before the panel reads it; the route follows
    // the live pick, as the shell's pick={toStagePick(p.pick)} does
    useEffect(() => { place.select(index) }, []) // eslint-disable-line react-hooks/exhaustive-deps -- one pick, once
    const pick = place.pick === null ? null : place.pick === 'mark' ? { t: 'mark' as const } : { t: 'piece' as const, index: place.pick }
    return <StagePanel lab={lab} api={bible} pick={pick} select={select} place={place} pieces={pieces} />
  }
  render(<Host />)
  return { select }
}

const fns = () => ({
  edit: vi.fn().mockResolvedValue(undefined), add: vi.fn().mockResolvedValue(undefined), mark: vi.fn().mockResolvedValue(undefined),
  label: vi.fn().mockResolvedValue(undefined), swap: vi.fn().mockResolvedValue(undefined),
})
/** jsdom has no pieces route: the strip reads nothing */
const NO_PIECES: PiecesApi = { get: async () => { throw new Error('no route') }, build: vi.fn(), recover: vi.fn(), complete: vi.fn() }

describe('Piece panel', () => {
  it('a picked piece replaces the set panel: its name, its numbers and Remove — no step buttons, no swap, no Back to set', () => {
    mount(0, world0, fns(), NO_PIECES)
    expect(screen.queryByTestId('scene-panel')).toBeNull()
    expect(screen.getByTestId('piece-name').textContent).toBe(plan.kit[0].label ?? 'crates')
    expect(screen.getByTestId('piece-numbers').textContent).toMatch(/^[\d.]+ × [\d.]+ m, [\d.]+ m tall \(\d+%\) · turned -?\d+° · \d+\.\d m high$/)
    expect(screen.getByTestId('piece-remove')).toBeTruthy()
    for (const id of ['piece-smaller', 'piece-larger', 'piece-turn-left', 'piece-turn-right', 'piece-lower', 'piece-raise', 'piece-back', 'piece-swap', 'piece-swap-kind', 'piece-role', 'piece-words', 'master-preview', 'hero-block'])
      expect(screen.queryByTestId(id)).toBeNull()
  })

  it("Remove is the Set's own save, and the set panel comes back", async () => {
    const api = fns()
    mount(0, world0, api, NO_PIECES)
    fireEvent.click(screen.getByTestId('piece-remove'))
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith(ID, 0, 'crates', { remove: true }))
    await waitFor(() => expect(screen.getByTestId('scene-panel')).toBeTruthy())
  })
})
