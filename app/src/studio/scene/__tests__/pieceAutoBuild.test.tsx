// @vitest-environment jsdom
// The automatic 3D build of a prop placed on the Stage (pieceAutoBuild.ts): one press per tile per page, through the pieces route's
// own build (mocked here: nothing is paid); while it runs every usePieces on the set counts it as busy and says pieceBuilding, so
// the piece panel shows the clock and no button, and a second start is refused without a call. A refusal (the day budget) stays on
// the piece panel in words with the stand-in kept, and the manual press is the retry.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PieceRequestError, type PieceRecord, type PiecesApi, type PiecesResponse } from '../piecesApi'
import { AUTO_WAIT, resetAutoBuilds, startAutoBuild } from '../pieceAutoBuild'
import { usePieces } from '../usePieces'
import { PieceBuild } from '../../stage/panels/PieceBuild'

afterEach(() => { cleanup(); resetAutoBuilds() })

const W = 'loc-auto'
const status = (o: Partial<PiecesResponse> = {}): PiecesResponse =>
  ({ price: 12, tiles: [{ tag: 'cart', name: 'Cart', look: '/l/cart.png', status: 'none' }], running: null, setChangedAt: null, stillStale: false, ...o })

function apiOf(build: PiecesApi['build']): PiecesApi {
  return { get: vi.fn(async () => status()), build: vi.fn(build), recover: vi.fn(), complete: vi.fn() }
}
const NO_STILL = { read: vi.fn(), render: vi.fn(), upload: vi.fn() }

function Panel({ api }: { api: PiecesApi }) {
  const p = usePieces(W, api, NO_STILL as never)
  return <div><span data-testid="building">{String(p.pieceBuilding)}</span>
    <PieceBuild tag="cart" p={p} models={[]} pics={['/l/cart.png']} picked="/l/cart.png" text="a hand cart" goBack={async () => {}} /></div>
}

describe('the automatic build of a Stage-placed prop', () => {
  it('starts once: a second start (a second placement, a remount), while it runs or after it landed, sends nothing', async () => {
    let done!: (r: PieceRecord) => void
    const api = apiOf(() => new Promise<PieceRecord>((r) => { done = r }))
    expect(startAutoBuild(api, W, 'cart')).toBe(true)
    expect(startAutoBuild(api, W, 'cart')).toBe(false)
    expect(api.build).toHaveBeenCalledTimes(1)
    expect(api.build).toHaveBeenCalledWith(W, 'cart')
    await act(async () => { done({} as PieceRecord) })
    expect(startAutoBuild(api, W, 'cart')).toBe(false) // built: never pressed for you again (the button is the rebuild)
    expect(api.build).toHaveBeenCalledTimes(1)
  })

  it('while it runs: the piece panel shows the clock and no button, and the hook says pieceBuilding', async () => {
    let done!: (r: PieceRecord) => void
    const api = apiOf(() => new Promise<PieceRecord>((r) => { done = r }))
    render(<Panel api={api} />)
    await waitFor(() => expect(screen.getByTestId('piece-build-go')).toBeTruthy())
    expect(screen.getByTestId('building').textContent).toBe('false')
    act(() => { startAutoBuild(api, W, 'cart') })
    await waitFor(() => expect(screen.getByTestId('piece-build-pill')).toBeTruthy())
    expect(screen.getByTestId('piece-build-pill').textContent).toContain('Building the 3D piece')
    expect(screen.queryByTestId('piece-build-go')).toBeNull()
    expect(screen.getByTestId('building').textContent).toBe('true')
    await act(async () => { done({} as PieceRecord) })
    await waitFor(() => expect(screen.getByTestId('building').textContent).toBe('false'))
  })

  it('a day-budget refusal stays on the panel in words, the stand-in kept; the manual press retries and clears it', async () => {
    const budget = 'Day budget reached: 495.0 of 500 credits spent today, this job needs about 12 more. Raise the daily spending limit (see SETUP) and restart the app to continue.'
    const api = apiOf(async () => { throw new PieceRequestError(budget, 429) })
    render(<Panel api={api} />)
    await waitFor(() => expect(screen.getByTestId('piece-build-go')).toBeTruthy())
    act(() => { startAutoBuild(api, W, 'cart') })
    await waitFor(() => expect(screen.getByTestId('piece-build-auto-error').textContent).toContain('Day budget reached'))
    expect(screen.getByTestId('piece-build-auto-error').textContent).toContain('It stays a stand-in')
    expect(screen.getByTestId('piece-build-hint').textContent).toContain('stand-in')
    fireEvent.click(screen.getByTestId('piece-build-go')) // the retry: the same route, pressed by hand
    await waitFor(() => expect(api.build).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByTestId('piece-build-auto-error')).toBeNull())
  })

  it('a prop approved while another automatic build on the set runs waits its turn, says so, and is sent once when that one ends', async () => {
    const done: ((r: PieceRecord) => void)[] = []
    const api = apiOf(() => new Promise<PieceRecord>((r) => { done.push(r) }))
    startAutoBuild(api, W, 'first')
    expect(startAutoBuild(api, W, 'cart')).toBe(false) // nothing sent now: one build at a time
    expect(startAutoBuild(api, W, 'cart')).toBe(false) // and never queued twice
    expect(api.build).toHaveBeenCalledTimes(1)
    const { result } = renderHook(() => usePieces(W, api, NO_STILL as never))
    await waitFor(() => expect(result.current.autoFailed.cart).toBe(AUTO_WAIT))
    expect(result.current.busy.first).toBeTypeOf('number')
    await act(async () => { done[0]({} as PieceRecord) })
    await waitFor(() => expect(api.build).toHaveBeenCalledTimes(2)) // its turn: sent once, by itself
    expect(api.build).toHaveBeenLastCalledWith(W, 'cart')
    await waitFor(() => expect(result.current.autoFailed.cart).toBeUndefined())
    expect(result.current.busy.cart).toBeTypeOf('number')
    await act(async () => { done[1]({} as PieceRecord) })
    expect(api.build).toHaveBeenCalledTimes(2)
  })
})
