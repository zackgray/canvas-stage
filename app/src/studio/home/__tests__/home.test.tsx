// @vitest-environment jsdom
// Home: the Start a new scene press over the Resume list (newest first, name, stage reached, last edited), Remove asks then hides.
// The press opens the Stage of a scene with no work yet: it reuses the newest untouched empty scene (still "Untitled scene",
// nothing built) instead of making another, and untouched scenes stay off the Resume list — they would be rows the owner cannot
// tell apart; a scene is named from its first words on the Stage, so written scenes name themselves. No words are taken or paid
// for here.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STALE_SCENE, StaleSceneError, type LibraryApi } from '../../../library/api'
import type { SceneSummary, SceneView } from '../../../shared/libraryContract'
import { loadDesign } from '../../scene/design/state'
import { btn } from '../../scene/__tests__/drive'
import { Home } from '../Home'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

const NOW = Date.parse('2026-10-25T12:00:00Z')
const NEW = 'sc-20261025120000-cccc'
const sum = (id: string, name: string, stage: SceneSummary['stage'], lastEdited: string): SceneSummary =>
  ({ id, name, thumbnail: null, stage, lastEdited, hidden: false, revision: 2 })
const A = sum('sc-20261025090000-aaaa', 'Old hamlet', 'board', '2026-10-25T09:00:00Z')
const B = sum('sc-20261025110000-bbbb', 'Ski chase', 'shoot', '2026-10-25T11:00:00Z')
const U = sum('sc-20261025120000-uuuu', 'Untitled scene', 'brief', '2026-10-25T12:00:00Z') // untouched: nothing written, nothing built
const view = (s: SceneSummary): SceneView => ({ ...s, createdAt: 't', updatedAt: 't', worldId: null, worlds: [], summary: s, facts: { setBuilt: false, briefChanged: false, takes: {} } })

function fakeLib(list = [A, B]) {
  let rows = [...list]
  return {
    list: vi.fn(async () => [...rows].sort((x, y) => y.lastEdited.localeCompare(x.lastEdited))),
    create: vi.fn(async () => { const s = sum(NEW, 'Untitled scene', 'brief', '2026-10-25T12:00:00Z'); rows = [s, ...rows]; return view(s) }),
    rename: vi.fn(async (id: string, name: string) => { rows = rows.map((r) => (r.id === id ? { ...r, name } : r)); return view(rows.find((r) => r.id === id)!) }),
    remove: vi.fn(async (id: string) => { const gone = rows.find((r) => r.id === id)!; rows = rows.filter((r) => r.id !== id); return view(gone) }),
  } as unknown as LibraryApi
}
const press = async (id: string) => { await act(async () => { fireEvent.click(screen.getByTestId(id)) }) }

describe('Home', () => {
  it('lists the scenes newest first with name, stage reached and last edited', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    render(<Home api={fakeLib()} go={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('resume-list')).toBeTruthy())
    const rows = screen.getAllByTestId(/^resume-sc-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([`resume-${B.id}`, `resume-${A.id}`])
    expect(screen.getByTestId(`resume-name-${B.id}`).textContent).toBe('Ski chase')
    expect(screen.getByTestId(`resume-meta-${B.id}`).textContent).toBe('Stage · edited 1 hour ago')
    expect(screen.getByTestId(`resume-meta-${A.id}`).textContent).toBe('Not built yet · edited 3 hours ago')
    expect(screen.getByTestId(`resume-open-${B.id}`).getAttribute('href')).toBe(`#/studio/${B.id}/stage`)
  })

  it('a scene saved at the old Set or Shoot stage reads as the Stage (persisted values, no migration)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const old = sum('sc-20261025080000-dddd', 'Burnt field', 'set', '2026-10-25T08:00:00Z')
    render(<Home api={fakeLib([old])} go={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('resume-list')).toBeTruthy())
    expect(screen.getByTestId(`resume-meta-${old.id}`).textContent).toBe('Stage · edited 4 hours ago')
  })

  it('has no strip, board or stepper of its own', async () => {
    render(<Home api={fakeLib([])} go={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('resume-empty')).toBeTruthy())
    for (const id of ['studio-strip', 'stepper', 'scene-stage']) expect(screen.queryByTestId(id)).toBeNull()
  })

  it('Remove asks first, Escape backs out, and a yes hides the scene from the list', async () => {
    const api = fakeLib()
    render(<Home api={api} go={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId(`resume-remove-${A.id}`)).toBeTruthy())
    await press(`resume-remove-${A.id}`)
    expect(screen.getByTestId('remove-ask').textContent).toMatch(/Nothing is deleted/)
    expect(api.remove).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(screen.queryByTestId('remove-ask')).toBeNull()
    await press(`resume-remove-${A.id}`)
    await press('remove-ask-yes')
    expect(api.remove).toHaveBeenCalledWith(A.id, A.revision)
    await waitFor(() => expect(screen.queryByTestId(`resume-${A.id}`)).toBeNull())
    expect(screen.getByTestId(`resume-${B.id}`)).toBeTruthy()
  })

  it('renames a scene in place', async () => {
    const api = fakeLib()
    render(<Home api={api} go={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId(`resume-rename-${A.id}`)).toBeTruthy())
    await press(`resume-rename-${A.id}`)
    const input = screen.getByTestId('resume-rename-input')
    fireEvent.change(input, { target: { value: 'Hamlet at dusk' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(api.rename).toHaveBeenCalledWith(A.id, 'Hamlet at dusk', A.revision)
    await waitFor(() => expect(screen.getByTestId(`resume-name-${A.id}`).textContent).toBe('Hamlet at dusk'))
  })

  it('m7: a rename another tab got to first is said in plain words; the list is read again so the next try is current', async () => {
    const api = fakeLib()
    ;(api.rename as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new StaleSceneError(STALE_SCENE, 3))
    render(<Home api={api} go={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId(`resume-rename-${A.id}`)).toBeTruthy())
    const reads = (api.list as ReturnType<typeof vi.fn>).mock.calls.length
    await press(`resume-rename-${A.id}`)
    const input = screen.getByTestId('resume-rename-input')
    fireEvent.change(input, { target: { value: 'Hamlet at dusk' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(api.rename).toHaveBeenCalledWith(A.id, 'Hamlet at dusk', A.revision)
    await waitFor(() => expect(screen.getByTestId('home-error').textContent).toBe(STALE_SCENE))
    expect((api.list as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(reads)
    expect(screen.getByTestId(`resume-name-${A.id}`).textContent).toBe('Old hamlet') // nothing written over the other tab
  })

  it('the one box is a Start a new scene press: no words box, no Develop, no price', async () => {
    render(<Home api={fakeLib([])} go={vi.fn()} />)
    expect(screen.getByTestId('home-box').textContent).toMatch(/Start a new scene/)
    expect(btn('home-box-start').disabled).toBe(false)
    for (const id of ['home-box-text', 'home-box-develop', 'home-box-asis']) expect(screen.queryByTestId(id)).toBeNull()
  })

  it('Start a new scene makes a new scene and opens its Stage; nothing of another scene comes with it', async () => {
    const api = fakeLib()
    const go = vi.fn()
    localStorage.setItem(`canvas-stage.scene.design.v1.${B.id}`, JSON.stringify({ brief: 'the chase down the slope', route: 'guided', pieces: [{ id: 'p1', tag: 'slope', name: 'Slope', type: 'location', onBoard: true }] }))
    render(<Home api={api} go={go} />)
    await press('home-box-start')
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledWith(`#/studio/${NEW}/stage`)
    expect(loadDesign(NEW)).toMatchObject({ screen: 'guided', route: 'guided', brief: '', edited: false, pieces: [] })
    expect(loadDesign(B.id).brief).toBe('the chase down the slope') // the other scene's design is untouched
  })

  it('hides untouched empty scenes from the Resume list; a written one stays even before its set is built', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    render(<Home api={fakeLib([U, A])} go={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('resume-list')).toBeTruthy())
    expect(screen.queryByTestId(`resume-${U.id}`)).toBeNull() // nothing in it: no row the owner cannot tell apart
    expect(screen.getByTestId(`resume-${A.id}`)).toBeTruthy()
  })

  it('offers Continue on the newest scene with work in it, and none when there is nothing to continue', async () => {
    const { unmount } = render(<Home api={fakeLib([A, B])} go={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('home-box-continue')).toBeTruthy())
    expect(screen.getByTestId('home-box-continue').getAttribute('href')).toBe(`#/studio/${B.id}/stage`)
    unmount()
    render(<Home api={fakeLib([U])} go={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('resume-empty')).toBeTruthy())
    expect(screen.queryByTestId('home-box-continue')).toBeNull()
  })

  it('reads as empty when every scene is untouched', async () => {
    render(<Home api={fakeLib([U])} go={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('resume-empty')).toBeTruthy())
    expect(screen.queryByTestId('resume-list')).toBeNull()
  })

  it('Start reuses the newest untouched empty scene instead of making another', async () => {
    const api = fakeLib([U, A])
    const go = vi.fn()
    render(<Home api={api} go={go} />)
    await waitFor(() => expect(screen.getByTestId('home-box-start')).toBeTruthy())
    await press('home-box-start')
    expect(api.create).not.toHaveBeenCalled()
    expect(go).toHaveBeenCalledWith(`#/studio/${U.id}/stage`)
    expect(loadDesign(U.id)).toMatchObject({ route: 'guided', brief: '' }) // it opens ready for its first words
  })
})
