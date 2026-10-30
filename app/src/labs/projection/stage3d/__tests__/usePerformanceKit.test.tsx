// @vitest-environment jsdom
// usePerformance on a kit world: the 3D performer is listed first and on by default; "none" takes it off; picking it puts it back.
// `layer` is then the mocap layer (what take lock reads), `packLayer` stays null (no lifted pack).
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WALK_TOWARD } from '../../../../stage3d/presets'
import { usePerformance } from '../../performance/usePerformance'
import type { KitLayer } from '../KitLayer'
import { planHash } from '../MocapLayer'

const ons: boolean[] = []
const fakeLayer = { pack: { id: `mocap-${planHash(WALK_TOWARD)}`, frames: 105 } }
vi.mock('../useMocap', () => ({ useMocap: (_s: unknown, _k: unknown, _p: unknown, on: boolean) => { ons.push(on); return { layer: on ? fakeLayer : null, phase: null, error: null } } }))
vi.mock('../../performance/load', () => ({ listPacks: async () => [], fetchPack: async () => { throw new Error('no packs') }, loadPack: async () => [] }))

const ID = 'loc-2026-10-23T03-00-01-000'
const kit = { id: ID, layer: { worldId: ID } as unknown as KitLayer, perf: WALK_TOWARD }

describe('usePerformance on a kit world', () => {
  it('lists the 3D performer, on by default; none takes it off, picking it puts it back', async () => {
    const { result } = renderHook(() => usePerformance(null, ID, kit))
    await waitFor(() => expect(result.current.listed).toBe(true))
    const id = `mocap-${planHash(WALK_TOWARD)}`
    expect(result.current.packs).toEqual([{ id, label: '3D performer', locationId: ID, frames: 105, fps: 24 }])
    expect(result.current.selected).toBe(id)
    expect(result.current.layer).toBe(fakeLayer)
    expect(result.current.packLayer).toBeNull()
    act(() => result.current.select(null))
    expect(result.current.selected).toBeNull()
    expect(result.current.layer).toBeNull()
    expect(ons.at(-1)).toBe(false)
    act(() => result.current.select(id))
    expect(result.current.selected).toBe(id)
    expect(ons.at(-1)).toBe(true)
  })

  it('off a kit world there is no 3D performer', async () => {
    const { result } = renderHook(() => usePerformance(null, 'loc-2026-10-21T20-27-13-766'))
    await waitFor(() => expect(result.current.listed).toBe(true))
    expect(result.current.packs).toEqual([])
    expect(result.current.selected).toBeNull()
    expect(ons.at(-1)).toBe(false)
  })
})
