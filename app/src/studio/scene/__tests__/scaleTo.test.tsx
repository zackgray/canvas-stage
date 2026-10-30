// @vitest-environment jsdom
// Sizing a piece through the Set's composing state (owner 2026-10-29, the grandstand): an absolute size is saved as asked, far past
// the old 4x; past the piece's 100 m it saves the largest and says so in words, never silently (the silent 4x clamp is what read as
// "it snapped back"); a refusal is still said as before.
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitWorld } from '../../../labs/projection/stage3d/kitApi'
import type { ScenePlan } from '../../../stage3d/contract'
import type { PlaceApi } from '../setPlaceApi'
import { useSetPlace } from '../useSetPlace'

afterEach(cleanup)

const ID = 'loc-2026-10-29T23-00-00-001'
const plan: ScenePlan = { seed: 1, sky: { url: '/lab-assets/sky/procedural' }, kit: [{
  kind: 'grandstand', at: [-6, -29], label: 'grandstand', pieceTag: 'prop:grandstand', scale: 3.53,
  glb: { url: '/lab-assets/locations/loc-x/pieces/grandstand/p-1/mesh.glb', yawOffsetDeg: 90, unitScale: 2 },
}] }
const world: KitWorld = { id: ID, description: 'd', plan, perf: { path: [[0, 0], [0, 1]], pace: 0.8 }, still: null, createdAt: '' }
const fake = (): PlaceApi => ({ edit: vi.fn(async () => {}), add: vi.fn(async () => {}), mark: vi.fn(async () => {}) })

function picked(api: PlaceApi) {
  const h = renderHook(() => useSetPlace(world, api))
  act(() => { h.result.current.select(0) })
  return h
}

describe('scaleTo', () => {
  it('saves a grandstand-sized scale as asked (15 = 30 m across), with no message', async () => {
    const api = fake(), h = picked(api)
    await act(async () => { await h.result.current.scaleTo(15) })
    expect(api.edit).toHaveBeenCalledWith(ID, 0, 'grandstand', { scale: 15 })
    expect(h.result.current.error).toBeNull()
  })

  it('past 100 m across it saves the largest (50 for a 2 m mesh) and says so', async () => {
    const api = fake(), h = picked(api)
    await act(async () => { await h.result.current.scaleTo(400) })
    expect(api.edit).toHaveBeenCalledWith(ID, 0, 'grandstand', { scale: 50 })
    expect(h.result.current.error).toMatch(/grandstand stops at about 100 m across/)
  })

  it('scaleBy multiplies the saved size and stays inside the range', async () => {
    const api = fake(), h = picked(api)
    await act(async () => { await h.result.current.scaleBy(2) })
    expect(api.edit).toHaveBeenLastCalledWith(ID, 0, 'grandstand', { scale: 7.06 })
  })

  it('a refusal is said as before, not replaced by the size line', async () => {
    const api = fake()
    ;(api.edit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('the set changed in the meantime; look again and retry'))
    const h = picked(api)
    await act(async () => { await h.result.current.scaleTo(400) })
    expect(h.result.current.error).toBe('grandstand was not resized: the set changed in the meantime; look again and retry')
  })
})
