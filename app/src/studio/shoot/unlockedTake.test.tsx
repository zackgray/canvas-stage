// @vitest-environment jsdom
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
import { resetLockedTakes } from './worldTakes'

const SCENE = 'sc-20261024101500-ab12'
vi.mock('../../library/currentScene', async (orig) => ({ ...(await orig<object>()), currentSceneId: () => SCENE }))

const pack = { id: 'pack-a', fps: 24, frames: 400 }
function fakeLab(source = 'loc-a') {
  const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
  const lab = { op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: { view: { aspect: 16 / 9 } }, s: { source },
    performance: { layer: { pack }, listed: true, packs: [], selected: 'pack-a' } } as unknown as ProjectionLabState
  return { lab, engine }
}

let disk: TakeRecord[] = []
beforeEach(() => {
  disk = []
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return new Response(JSON.stringify({ takes: disk }))
    if (url === '/__lab/takes/lock') {
      const q = JSON.parse(init!.body as string) as TakeLockRequest
      const take = { ...q, id: `take-${disk.length + 1}`, startKey: startKey(q.samples[0], q.focal, q.perfStart), lockedAt: 'x', createdAt: 'x' } as TakeRecord
      disk.push(take)
      return new Response(JSON.stringify({ take }), { status: 201 })
    }
    return new Response('{"error":"none"}', { status: 404 })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetClayStore(); resetCurrentTake(); resetLockedTakes() })

describe('an unlocked take survives a reload', () => {
  it('is put back on the deck, with its Lock button, when Shoot opens again on the same set', async () => {
    const first = fakeLab()
    first.engine.deck.take = fakeTake(4)
    render(<TakeLockBlock lab={first.lab} />)
    await screen.findByTestId('take-lock-btn')
    cleanup() // the reload: a new engine, nothing in memory
    const again = fakeLab()
    expect(again.engine.deck.take).toBeNull()
    render(<TakeLockBlock lab={again.lab} />)
    expect(again.engine.deck.take?.raw.samples.length).toBe(fakeTake(4).raw.samples.length)
    expect(await screen.findByTestId('take-lock-btn')).toBeTruthy()
  })

  it('is not put on another set, and not once it has been locked', async () => {
    const first = fakeLab()
    first.engine.deck.take = fakeTake(4)
    render(<TakeLockBlock lab={first.lab} />)
    await screen.findByTestId('take-lock-btn')
    cleanup()
    const other = fakeLab('loc-b')
    render(<TakeLockBlock lab={other.lab} />)
    expect(other.engine.deck.take).toBeNull()
    cleanup()
    const back = fakeLab()
    back.engine.deck.take = fakeTake(4)
    render(<TakeLockBlock lab={back.lab} />)
    act(() => { screen.getByTestId('take-lock-btn').click() })
    await screen.findByTestId('take-locked')
    await waitFor(() => expect(localStorage.length).toBe(0))
    cleanup()
    const after = fakeLab()
    render(<TakeLockBlock lab={after.lab} />)
    expect(after.engine.deck.take).toBeNull()
  })
})

describe('a locked take after a reload', () => {
  it('is the one on show, locked, with nothing recorded', async () => {
    const q = { worldId: 'loc-a', packId: 'pack-a', samples: fakeTake(4).smoothed, focal: 35, perfStart: 0, frames: 97 }
    disk = [{ ...q, id: 'take-old', startKey: startKey(q.samples[0], 35, 0), lockedAt: '2026-10-24T10:00:00Z' } as TakeRecord]
    const { lab, engine } = fakeLab()
    expect(engine.deck.take).toBeNull()
    render(<TakeLockBlock lab={lab} />)
    await waitFor(() => expect(screen.getByTestId('take-locked')).toBeTruthy())
    expect(currentTakeId()).toBe('take-old')
    expect(screen.queryByTestId('take-lock-btn')).toBeNull()
  })
})
