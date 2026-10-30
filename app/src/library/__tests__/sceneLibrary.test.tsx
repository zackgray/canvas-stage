// @vitest-environment jsdom
// The scene library on the page (every route mocked): a stale scene write is refused and marks the scene stale (m7; the stale draft
// write said in plain words is in stage/__tests__/draftWritersSeam); a scene's stage, board and set never show another scene's (m11): the stage follows the scene's own world (none for a
// new scene), each scene keeps its own design, and opening another scene drops the last one at once.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BankShot } from '../../labs/projection/engine/manifest'
import { NO_SET } from '../../labs/projection/ui/settings'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { SceneView } from '../../shared/libraryContract'
import { freshDesign, loadDesign, saveDesign } from '../../studio/scene/design/state'
import { useLabDefaults } from '../../studio/useLabDefaults'
import { STALE_SCENE, StaleSceneError, type LibraryApi } from '../api'
import { openScene, renameScene, resetCurrentScene, useCurrentScene } from '../currentScene'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); resetCurrentScene() })

const A = 'sc-20261025090000-aaaa', B = 'sc-20261025090000-bbbb'
const W1 = 'loc-2026-10-25T09-00-00-000', W2 = 'loc-2026-10-25T10-00-00-000'
const shot = (id: string) => ({ id, image: `/lab-assets/locations/${id}/still.png`, manifest: '/lab-assets/locations/manifest.json', depths: [] }) as unknown as BankShot
const doc = (id: string, worldId: string | null, revision = 1): SceneView => ({ id, name: id, revision, hidden: false, createdAt: 't', updatedAt: 't', worldId,
  worlds: worldId ? [{ id: worldId, builtAt: 't', brief: null }] : [], summary: { id, name: id, thumbnail: null, stage: 'brief', lastEdited: 't', hidden: false, revision },
  facts: { setBuilt: !!worldId, briefChanged: false, takes: {} } })

describe('m7: two tabs on one scene', () => {
  it('a stale scene write (a rename) is refused, marks the scene stale and leaves the shown copy as it was', async () => {
    const api = { get: vi.fn(async () => doc(A, null, 3)), rename: vi.fn(async () => { throw new StaleSceneError(STALE_SCENE, 4) }) } as unknown as LibraryApi
    resetCurrentScene(api)
    const { result } = renderHook(() => useCurrentScene())
    act(() => openScene(A))
    await waitFor(() => expect(result.current.view?.revision).toBe(3))
    let ok = true
    await act(async () => { ok = await renameScene('Mine') })
    expect(ok).toBe(false)
    expect(result.current).toMatchObject({ stale: true, error: STALE_SCENE })
    expect(result.current.view?.name).toBe(A)
    expect(api.rename).toHaveBeenCalledWith(A, 'Mine', 3)
  })
})

describe('m11: scenes never show each other', () => {
  function lab(source: string) {
    const pickSource = vi.fn()
    const l = { shots: [shot(W1), shot(W2)], pickSource, s: { source }, op: { mode: 'orbit', setMode: vi.fn() }, performance: { layer: null } }
    return { l: l as unknown as ProjectionLabState, pickSource }
  }

  it("the stage shows the scene's own set, and none for a scene with no set yet", () => {
    const { l, pickSource } = lab(W1)
    const { rerender } = renderHook(({ w }: { w: string | null | undefined }) => useLabDefaults(l, w), { initialProps: { w: undefined as string | null | undefined } })
    expect(pickSource).not.toHaveBeenCalled() // the scene is still loading: nothing is picked for it
    rerender({ w: W2 })
    expect(pickSource).toHaveBeenLastCalledWith(W2)
    rerender({ w: null }) // a new scene: no set, so no old master or takes on the stage or the strip
    expect(pickSource).toHaveBeenLastCalledWith(NO_SET)
  })

  it("m-10: a scene whose set is not listed yet shows no set, never the last scene's; its set shows once listed, and back again", () => {
    const W3 = 'loc-2026-10-25T11-00-00-000' // built, its master view not in the manifest yet
    const { l, pickSource } = lab(W1) // the last scene's set on the stage
    const { rerender } = renderHook(({ lab: x, w }: { lab: ProjectionLabState; w: string | null | undefined }) => useLabDefaults(x, w), { initialProps: { lab: l, w: W1 as string | null | undefined } })
    rerender({ lab: l, w: undefined }) // the next scene loading
    rerender({ lab: l, w: W3 })
    expect(pickSource).toHaveBeenLastCalledWith(NO_SET)
    const blank = { ...l, s: { ...l.s, source: NO_SET } } as ProjectionLabState
    rerender({ lab: blank, w: W3 }) // polls go by: blanked once, nothing picked again
    expect(pickSource).toHaveBeenCalledTimes(1)
    rerender({ lab: blank, w: W1 }) // back to the first scene: its set again
    expect(pickSource).toHaveBeenLastCalledWith(W1)
    rerender({ lab: l, w: W3 }) // and over again: blank again
    expect(pickSource).toHaveBeenLastCalledWith(NO_SET)
    const listed = { ...blank, shots: [...(l.shots ?? []), shot(W3)] } as ProjectionLabState
    rerender({ lab: listed, w: W3 }) // the manifest poll lists it
    expect(pickSource).toHaveBeenLastCalledWith(W3)
  })

  it('a build that lands on its new world first is not pulled back to the scene\'s old one', () => {
    const { l, pickSource } = lab(W1)
    const { rerender } = renderHook(({ lab: x, w }: { lab: ProjectionLabState; w: string | null }) => useLabDefaults(x, w), { initialProps: { lab: l, w: W1 } })
    expect(pickSource).not.toHaveBeenCalled() // already on it
    rerender({ lab: { ...l, s: { ...l.s, source: W2 } } as ProjectionLabState, w: W1 }) // the build landed; the scene not read again yet
    expect(pickSource).not.toHaveBeenCalled()
    rerender({ lab: { ...l, s: { ...l.s, source: W2 } } as ProjectionLabState, w: W2 }) // read again: the same world
    expect(pickSource).not.toHaveBeenCalled()
  })

  it("each scene keeps its own design: a new scene opens empty", () => {
    saveDesign({ ...freshDesign(), brief: 'the old chase', pieces: [{ id: 'p1', tag: 'robin', name: 'Robin', type: 'person', state: 'approved', looks: ['/x.png'], look: 0, line: '', onBoard: true }] } as never, A)
    expect(loadDesign(A).brief).toBe('the old chase')
    // a fresh design's guided cast-card ids are generated (a module counter): everything else must be the defaults
    expect({ ...loadDesign(B), guided: null }).toEqual({ ...freshDesign(), guided: null })
  })

  it("opening another scene drops the last one's document at once", async () => {
    const api = { get: vi.fn(async (id: string) => doc(id, id === A ? W1 : null)) } as unknown as LibraryApi
    resetCurrentScene(api)
    const { result } = renderHook(() => useCurrentScene())
    act(() => openScene(A))
    await waitFor(() => expect(result.current.view?.worldId).toBe(W1))
    act(() => openScene(B))
    expect(result.current).toMatchObject({ id: B, view: null }) // nothing of A in between
    await waitFor(() => expect(result.current.view).toMatchObject({ id: B, worldId: null }))
  })
})
