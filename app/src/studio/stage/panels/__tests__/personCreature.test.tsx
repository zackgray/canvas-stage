// @vitest-environment jsdom
// The Stage's Add a creature (hide-more-creatures): switched off — the Person panel no longer mounts it, so a scene with a
// creature keeps no creature controls ("More creatures", Add / Move / Remove) and nothing sends creatures in a save. DOM only.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CREATURE_KIND, type ScenePlan } from '../../../../stage3d/contract'
import { BATTLEFIELD } from '../../../../stage3d/presets'
import { markOf } from '../../../../stage3d/mark'
import { standPath } from '../../../../stage3d/motion/standPlan'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import { useSetPlace } from '../../../scene/useSetPlace'
import { StagePanel } from '../StagePanel'

const PLAN: ScenePlan = BATTLEFIELD
const MARK = markOf(PLAN)
const STAND = standPath(MARK)
const CREATURE = { kind: CREATURE_KIND, action: 'roar' as const, at: [MARK.at[0], MARK.at[1] - 20] as [number, number], yawDeg: 0, scale: 1.2 }
const world = (perf: KitWorld['perf']): KitWorld => ({ id: 'loc-2026-10-23T03-00-01-000', description: 'd', plan: PLAN, perf, still: null, createdAt: '' })
const lab = (w: KitWorld) => ({ kit: { id: w.id, world: w, layer: null, perf: w.perf, error: null }, stage: {} }) as unknown as ProjectionLabState

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function mount(w: KitWorld) {
  const saves: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (url.startsWith('/__lab/stage3d/performance')) saves.push(body)
    return url.startsWith('/__lab/bible') ? new Response(JSON.stringify({ bible: null }), { status: 200 })
      : new Response(JSON.stringify({ ...w, perf: body ?? w.perf }), { status: 200 })
  }))
  function Host() {
    const place = useSetPlace(w)
    return <StagePanel lab={lab(w)} pick={{ t: 'mark' }} select={vi.fn()} place={place} />
  }
  render(<Host />)
  return saves
}

describe('Add a creature (switched off)', () => {
  it('the Person panel mounts no creature controls on a scene without one', async () => {
    mount(world({ path: STAND, stand: true }))
    await waitFor(() => expect(screen.getByTestId('person-panel')).toBeTruthy())
    expect(screen.queryByTestId('advanced-person-creatures')).toBeNull()
    expect(screen.queryByTestId('creature-add')).toBeNull()
    expect(screen.getByTestId('person-panel').textContent).not.toMatch(/creature/i)
  })

  it('a scene that has a creature keeps no controls and nothing sends it again', async () => {
    const saves = mount(world({ path: STAND, stand: true, creatures: [CREATURE] }))
    await waitFor(() => expect(screen.getByTestId('person-panel')).toBeTruthy())
    expect(screen.queryByTestId('advanced-person-creatures')).toBeNull()
    expect(screen.queryByTestId('creature-0')).toBeNull()
    expect(screen.queryByTestId('creature-move-0')).toBeNull()
    expect(screen.queryByTestId('creature-remove-0')).toBeNull()
    expect(saves.filter((s) => Array.isArray(s.creatures))).toEqual([]) // nothing re-sends the creature
  })
})
