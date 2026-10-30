// @vitest-environment jsdom
// Pass 3: a Stage opened in Free view after a reload finds the scene's locked take (the Camera panel is not mounted then).
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { currentTakeId, resetCurrentTake } from '../../shoot/currentTake'
import { StageTakeRestore } from '../StageTakeRestore'

const take = { id: 'take-2026-10-27T05-00-00-001', worldId: 'loc-1', packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k',
  lockedAt: '2026-10-27T05:00:00.001Z', createdAt: 't' }
beforeEach(() => {
  resetCurrentTake()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ takes: [take] }), { status: 200, headers: { 'content-type': 'application/json' } })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake() })

describe('the Stage finds its locked take in every view', () => {
  it('nothing recorded: the newest locked take of the scene is the current one', async () => {
    const lab = { s: { source: 'loc-1' }, op: { engine: new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) } } as unknown as ProjectionLabState
    render(<StageTakeRestore lab={lab} />)
    await waitFor(() => expect(currentTakeId()).toBe(take.id))
  })

  it("another world's takes never become current (ported from worldTakes)", async () => {
    const lab = { s: { source: 'loc-empty' }, op: { engine: new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) } } as unknown as ProjectionLabState
    render(<StageTakeRestore lab={lab} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 80)) })
    expect(vi.mocked(fetch)).toHaveBeenCalled() // the list was read, and none of it belongs to this world
    expect(currentTakeId()).toBeNull()
  })
})
