// @vitest-environment jsdom
// Wave A join (client seams): Blocking's top view shows the mark's facing (S4's MarkFacing, mounted at the join), and the
// piece-drag route (shared by Blocking and the Set) says a server refusal in plain words, never the validator's raw line.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlan } from '../../../../../stage3d/contract'
import type { KitWorld } from '../../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../../labs/projection/useProjectionLab'
import { BlockingPanel } from '../index'
import { movePiece } from '../usePieceDrag'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const ID = 'loc-2026-10-25T12-00-00-000'
const plan: ScenePlan = { seed: 1, flat: [-3, -16, 3, 8], sky: { url: '/lab-assets/sky/procedural' }, mark: { at: [0.6, -12.5], yawDeg: 90 }, kit: [{ kind: 'tree', at: [-9, -14] }] }
const world = { id: ID, description: 'd', plan, perf: { path: [[0.6, -12.5], [0.6, -8]], pace: 0.8 }, still: null, createdAt: '' } as unknown as KitWorld
const lab = { kit: { id: ID, world, layer: null, perf: world.perf, error: null } } as unknown as ProjectionLabState

describe('Blocking shows the way the mark faces', () => {
  it('draws the facing arrow at the mark; the saved walk heads +z, so the arrow does too (not the yaw 90 of the mark: F1)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ bible: null }), { status: 200 })))
    render(<BlockingPanel lab={lab} />)
    await waitFor(() => expect(screen.getByTestId('mark-facing')).toBeTruthy())
    const tip = (screen.getByTestId('mark-facing').getAttribute('points') ?? '').split(' ')[0].split(',').map(Number)
    expect(tip[0]).toBeCloseTo(0.6); expect(tip[1]).toBeCloseTo(-11.5)
  })
})

describe('the piece-drag route says a refusal in plain words', () => {
  it('a 422 with the validator\'s list positions and coordinates is never shown raw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'the set would not be valid after this change', errors: ['kit[3].at [0.5,-400] is outside the ground'],
    }), { status: 422 })))
    const err = await movePiece(ID, 3, 'tree', [0.5, -400], 0).catch((e: Error) => e.message)
    expect(err).toBe('that would put a piece outside the limits of the set')
    expect(err).not.toMatch(/kit\[|\[|\d/)
  })
  it('a 409 says the set changed, in words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'kit[3] is no longer a tree' }), { status: 409 })))
    expect(await movePiece(ID, 3, 'tree', [1, 1], 0).catch((e: Error) => e.message)).toBe('the set changed in the meantime; look again and retry')
  })
})
