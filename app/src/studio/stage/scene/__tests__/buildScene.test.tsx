// @vitest-environment jsdom
// A paid job stays with the scene that pressed it (ported from jobs/sceneSwitch, the Board's version): Build the set in scene A, the
// owner opens scene B, A's plan lands while B is on screen. B's kit is never built and nothing of A shows on B; back in A the set is
// built once for A and the plan was paid once. The Stage's provider is mounted per scene (its job store is the scene's own), the
// planner and kit are fakes, nothing reaches Cloud. Also: a world written for A while the studio moved to B is still A's.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSceneJobs } from '../../../../jobs/sceneJobs'
import type { LibraryApi } from '../../../../library/api'
import { openScene, resetCurrentScene } from '../../../../library/currentScene'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { SceneView } from '../../../../shared/libraryContract'
import { BATTLEFIELD } from '../../../../stage3d/presets'
import { useKitBuild, type KitBuildDeps } from '../../../kit/useKitBuild'
import { DEVELOPED, V2 } from '../../../scene/__tests__/developFixture'
import { fakeBrief, paidCalls, type FakeBrief } from '../../../scene/__tests__/briefFakes'
import { fakeApi, kitDeps, kitShot } from '../../../scene/__tests__/fakes'
import { castCard, freshGuided, propCard } from '../../../scene/design/guided'
import { freshDesign, markUnsynced, saveDesign, type Design } from '../../../scene/design/state'
import { SetupPanel } from '../../panels/SetupPanel'
import { StageSceneProvider, useStageScene, type StageScene } from '../StageScene'

const A = 'sc-20261029040000-aaaa', B = 'sc-20261029040000-bbbb'
const lab = () => ({ kit: { id: null, world: null }, refreshShots: vi.fn(async () => [kitShot]), set: vi.fn() }) as unknown as ProjectionLabState
// both scenes already have a set (not the bare starting world), so only the plan can build anything here
const view = (id: string): SceneView => {
  const summary = { id, name: id === A ? 'Kitchen' : 'Harbour', thumbnail: null, stage: 'brief' as const, lastEdited: 't', hidden: false, revision: 1 }
  return { ...summary, createdAt: 't', updatedAt: 't', worldId: 'loc-old', worlds: [], summary, facts: { setBuilt: true, briefChanged: false, takes: {} } }
}
const library = { get: vi.fn(async (id: string) => view(id)) } as unknown as LibraryApi

interface Side { brief: FakeBrief; bible: ReturnType<typeof fakeApi>; kit: ReturnType<typeof kitDeps> }
let sides: Record<string, Side>
let seen: StageScene | null = null
function Peek() { seen = useStageScene(); return null }

/** the Stage's provider for one scene, remounted per scene (the shell keys it by the scene), with the Setup panel to press */
const ui = (scene: string) => (
  <StageSceneProvider scene={scene} worldId="loc-old" lab={lab()} deps={{ api: sides[scene].brief, bible: sides[scene].bible.api, buildKit: sides[scene].kit }}>
    <Peek /><SetupPanel />
  </StageSceneProvider>
)
const words = (who: string): Design => {
  const g = freshGuided([castCard(who, 'person', 'a cook in a faded blue apron')])
  return { ...freshDesign(), brief: `A small ${who} kitchen at dawn. @${who.toLowerCase()} lifts the copper kettle off the stove.`, v2: V2,
    guided: { ...g, props: [propCard('Copper kettle', 'a dented copper kettle')] } }
}
const seed = (d: Design, scene: string) => { saveDesign(d, scene); markUnsynced(scene) }
const settle = () => act(async () => { await new Promise((k) => setTimeout(k, 80)) })

beforeEach(() => {
  localStorage.clear(); seen = null; resetSceneJobs(); resetCurrentScene(library)
  sides = {}
  for (const id of [A, B]) sides[id] = { brief: fakeBrief({ developed: DEVELOPED }), bible: fakeApi(), kit: kitDeps() }
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) // no project, no server records
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); resetSceneJobs(); resetCurrentScene() })

describe('a paid plan stays with the scene that pressed it', () => {
  it('Build the set in A, open B, the plan lands: nothing is built on B; back in A the set is built once for A, the plan paid once', async () => {
    let land!: () => void
    const a = sides[A]
    const plan = a.brief.plan.getMockImplementation()!
    a.brief.plan.mockImplementationOnce((r) => new Promise((ok) => { land = () => ok(plan(r)) }))
    seed(words('Mara'), A); seed(words('Joss'), B)

    act(() => openScene(A))
    const v = render(ui(A))
    await waitFor(() => expect((screen.getByTestId('setup-build-press') as HTMLButtonElement).disabled).toBe(false))
    await act(async () => { fireEvent.click(screen.getByTestId('setup-build-press')) })
    await act(async () => { fireEvent.click(screen.getByTestId('build-ask-yes')) }) // the scene has a set: the paid rebuild asks first
    await waitFor(() => expect(a.brief.plan).toHaveBeenCalledTimes(1))

    act(() => openScene(B)) // the owner goes Home and opens scene B: the provider remounts for B
    v.rerender(ui(B))
    await waitFor(() => expect(seen?.scene).toBe(B))
    await act(async () => { land() }) // A's plan lands while B is on screen
    await settle()
    const b = sides[B]
    expect(a.kit.create).not.toHaveBeenCalled() // waits for A's own screen
    expect(b.kit.create).not.toHaveBeenCalled() // A's plan is never built on B
    expect(b.bible.api.approveSet).not.toHaveBeenCalled()
    expect(b.bible.api.save).not.toHaveBeenCalled()
    expect(paidCalls(b.brief)).toBe(0) // B's own planner was never asked
    expect(seen!.x.s.d.brief).toContain('Joss') // B shows B's words, nothing of A

    act(() => openScene(A))
    v.rerender(ui(A)) // back in A: its plan is applied here by its job, with nothing sent again
    await waitFor(() => expect(a.kit.create).toHaveBeenCalledTimes(1))
    expect(vi.mocked(a.kit.create).mock.calls[0][0]).toMatchObject({ scene: A }) // attached to A
    await waitFor(() => expect(a.bible.api.approveSet).toHaveBeenCalledTimes(1))
    expect(a.brief.plan).toHaveBeenCalledTimes(1) // never paid twice
    expect(b.kit.create).not.toHaveBeenCalled()
    expect(paidCalls(b.brief)).toBe(0)
  })

  it("a world written for A while the studio moved to B is still A's, and the stage on show never lands on it", async () => {
    let write!: () => void
    const world = { id: 'loc-2026-10-25T09-00-00-000', description: 'd', plan: BATTLEFIELD, perf: null, still: null, createdAt: '' }
    const deps: KitBuildDeps = {
      create: vi.fn(() => new Promise<never>((ok) => { write = () => ok(world as never) })), still: vi.fn(async () => new Blob(['png'])), upload: vi.fn(async () => world as never),
    }
    const shown = { refreshShots: vi.fn(async () => [kitShot]), set: vi.fn() }
    act(() => openScene(A))
    const { result } = renderHook(() => useKitBuild(shown, deps))
    let built!: Promise<string | null>
    act(() => { built = result.current.build(BATTLEFIELD) })
    act(() => openScene(B)) // the address now names B (the lab stays mounted on a direct switch)
    await act(async () => { write(); await built })
    expect(deps.create).toHaveBeenCalledWith(expect.objectContaining({ scene: A }))
    expect(await built).toBe(world.id)
    expect(shown.set).not.toHaveBeenCalled() // B's stage never shows A's set
  })
})
