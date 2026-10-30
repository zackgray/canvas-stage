// @vitest-environment jsdom
// The Stage's take lock: one button and one line of status. Lock take, then "Take locked."; a changed take says so and offers the
// lock again; no action field, no frame preparation press (the first frame prepares them), no take id or frame counts.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../labs/controller/engine/engine'
import { fakeTake } from '../../labs/projection/clay/__fixtures__/take'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { startKey, type TakeLockRequest, type TakeRecord } from '../../shared/shotContract'
import { currentTakeId, resetCurrentTake } from './currentTake'
import { resetClayStore } from './takeClay'
import { TakeLockBlock } from './TakeLockBlock'

const pack = { id: 'pack-a', fps: 24, frames: 400 }
/** The slice of the lab the block reads, around a real operator engine (ShootScreen.test.tsx's fakeLab). */
function fakeLab(extra: Partial<Record<string, unknown>> = {}) {
  const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
  const lab = {
    op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: { view: { aspect: 16 / 9 } }, s: { source: 'loc-a' },
    performance: { layer: { pack }, listed: true, packs: [], selected: 'pack-a' }, ...extra,
  } as unknown as ProjectionLabState
  return { lab, engine }
}

let disk: TakeRecord[] = []
beforeEach(() => {
  disk = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return new Response(JSON.stringify({ takes: disk }))
    if (url === '/__lab/takes/lock') {
      const q = JSON.parse(init!.body as string) as TakeLockRequest
      const take = { ...q, id: `take-${disk.length + 1}`, startKey: startKey(q.samples[0], q.focal, q.perfStart), lockedAt: 'x', createdAt: 'x' } as TakeRecord
      disk.push(take)
      return new Response(JSON.stringify({ take }), { status: 201 })
    }
    return new Response('{}', { status: 404 })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetClayStore() })

describe('TakeLockBlock', () => {
  it('shows nothing before a take exists', () => {
    const { lab } = fakeLab()
    const { container } = render(<TakeLockBlock lab={lab} />)
    expect(container.innerHTML).toBe('')
  })

  it('one Lock take button, then one status line; a new opening reads "changed since lock" and offers the lock again', async () => {
    const { lab, engine } = fakeLab()
    engine.deck.take = fakeTake(4)
    render(<TakeLockBlock lab={lab} />)
    const btn = await screen.findByTestId('take-lock-btn')
    expect(btn.textContent).toBe('Lock take')
    for (const gone of ['take-action', 'clay-export', 'take-price']) expect(screen.queryByTestId(gone)).toBeNull()
    act(() => { btn.click() })
    await waitFor(() => expect(screen.getByTestId('take-locked').textContent).toBe('Take locked.'))
    expect(screen.queryByTestId('take-lock-btn')).toBeNull()
    expect(disk[0]).toMatchObject({ frames: 97, packId: 'pack-a', worldId: 'loc-a', perfStart: 0 })
    expect('action' in disk[0]).toBe(false)
    expect(screen.queryByTestId('clay-export')).toBeNull()
    act(() => { engine.deck.take = fakeTake(4, { x0: 1 }) })
    await waitFor(() => expect(screen.getByTestId('take-changed')).toBeTruthy(), { timeout: 2000 })
    expect(screen.queryByTestId('take-locked')).toBeNull()
    expect(screen.getByTestId('take-lock-btn')).toBeTruthy()
  })

  it('one status line: the panel\'s next-step cue shows until the take changes since lock, then the changed line replaces it', async () => {
    resetCurrentTake()
    const { lab, engine } = fakeLab()
    const cue = <p data-testid="cue">Next: lock the take to keep it.</p>
    const { rerender } = render(<TakeLockBlock lab={lab} cue={cue} />)
    expect(screen.getByTestId('cue')).toBeTruthy() // no take yet: the cue alone
    engine.deck.take = fakeTake(4)
    rerender(<TakeLockBlock lab={lab} cue={cue} />)
    const btn = await screen.findByTestId('take-lock-btn')
    expect(btn.parentElement!.textContent).toContain('Free') // the price label reads as Record's does
    expect(screen.getByTestId('cue')).toBeTruthy()
    act(() => { btn.click() })
    await waitFor(() => expect(screen.getByTestId('take-locked')).toBeTruthy())
    act(() => { engine.deck.take = fakeTake(4, { x0: 1 }) })
    await waitFor(() => expect(screen.getByTestId('take-changed')).toBeTruthy(), { timeout: 2000 })
    expect(screen.queryByTestId('cue')).toBeNull() // never both: they say the same thing
    resetCurrentTake()
  })

  it('finds its lock on disk on first sight, and refuses a take too short to lock', async () => {
    const { lab, engine } = fakeLab()
    const q = { worldId: 'loc-a', packId: 'pack-a', samples: fakeTake(4).smoothed, focal: 35, perfStart: 0, frames: 97 }
    disk = [{ ...q, id: 'take-old', startKey: startKey(q.samples[0], 35, 0) } as TakeRecord]
    engine.deck.take = fakeTake(4)
    render(<TakeLockBlock lab={lab} />)
    await waitFor(() => expect(screen.getByTestId('take-locked').textContent).toBe('Take locked.'))
    cleanup()
    const short = fakeLab()
    short.engine.deck.take = fakeTake(0.2)
    render(<TakeLockBlock lab={short.lab} />)
    expect(screen.getByTestId('take-lock-refused').textContent).toMatch(/shorter than 9 frames/)
  })

  it('a world picked after the lock: "changed since lock" with the way back, the current take cleared (B3)', async () => {
    resetCurrentTake()
    const { lab, engine } = fakeLab()
    engine.deck.take = fakeTake(4)
    render(<TakeLockBlock lab={lab} />)
    act(() => { screen.getByTestId('take-lock-btn').click() })
    await waitFor(() => expect(screen.getByTestId('take-locked')).toBeTruthy())
    await waitFor(() => expect(currentTakeId()).toBe('take-1')) // the store follows in its own effect, after the text
    act(() => { (lab.s as { source: string }).source = 'loc-b' })
    await waitFor(() => expect(screen.getByTestId('take-changed').textContent).toMatch(/filmed on another set: switch back/), { timeout: 2000 })
    await waitFor(() => expect(currentTakeId()).toBeNull()) // the first frame and Render no longer treat take-1 as the set's take
    act(() => { (lab.s as { source: string }).source = 'loc-a' }) // back on the take's world: locked again, current again
    await waitFor(() => expect(screen.getByTestId('take-locked')).toBeTruthy(), { timeout: 2000 })
    await waitFor(() => expect(currentTakeId()).toBe('take-1')) // m17: the store follows in its own effect, after the text
    resetCurrentTake()
  })
})
