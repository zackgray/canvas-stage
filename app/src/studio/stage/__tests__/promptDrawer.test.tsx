// @vitest-environment jsdom
// The words drawer under the Stage's viewport (review item 1, F14): it shows the scene brief with its @chips, an edit goes the
// Board's own way (the scene draft, and the scene sheet so the next draw reads it), it opens collapsed under 800 px of window
// height, and it holds no Draw press of its own (duplicate-draw-buttons: the one Draw the first frame press is the steps block's,
// which nothing here can hide). Under the box, quiet and local only: a note when the words carry camera or lens language (Tidy
// strips just those phrases, Undo puts them back, × dismisses) and a one-line hint to type @ while no tag is in the words; and
// the first words name a still-untitled scene, so Resume never fills with "Untitled scene" rows. The draft, the sheet, the library
// and the pieces routes are faked; nothing spends.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUSTIC } from '../../../../server/planner/briefExamples'
import type { SceneBriefV2 } from '../../../shared/briefContract'
import type { DraftDesign } from '../../../shared/sceneContract'
import type { BriefApi } from '../../scene/briefApi'
import { mkPiece } from '../../scene/design/model'
import { freshDesign, type Design } from '../../scene/design/state'
import { SAVE_MS } from '../../scene/design/useDesign'
import { fakeApi, WORLD } from '../../scene/__tests__/fakes'
import { Drawer, resetDrawerChoice } from '../PromptDrawer'

const SCENE = 'sc-test-drawer'
const BRIEF = 'A quiet workshop at dawn. @maker turns a bowl on the wheel.'
const CAMERA_BRIEF = 'A low-angle tracking shot, 85mm lens, shallow depth of field. A quiet workshop at dawn.'
const draft = (): Design => ({ ...freshDesign(), screen: 'board', phase: 'board', brief: BRIEF, v2: RUSTIC.answer as unknown as SceneBriefV2,
  pieces: [mkPiece('maker', 'Maker', 'person', { onBoard: true })] })
const briefIo = () => ({
  loadDraft: vi.fn(async () => draft() as unknown as DraftDesign),
  saveDraft: vi.fn(async (_d: DraftDesign) => {}),
  uploadReference: vi.fn(async () => '/x.png'),
  status: vi.fn(async () => { throw new Error('no planner here') }),
}) as unknown as BriefApi & { loadDraft: ReturnType<typeof vi.fn>; saveDraft: ReturnType<typeof vi.fn> }
const tall = (h: number) => Object.defineProperty(window, 'innerHeight', { configurable: true, value: h })
const settle = () => new Promise((r) => setTimeout(r, SAVE_MS + 150))

beforeEach(() => {
  resetDrawerChoice(); tall(720)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) // no project (no saved cast cards)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

function mount(io = briefIo(), bible = fakeApi().api) {
  render(<Drawer scene={SCENE} worldId={WORLD} deps={{ api: io, bible }} />)
  return { io, bible }
}

/** open the drawer and type into the brief box (the box opens on the drawer's own click in a short window) */
async function edit(next: string) {
  fireEvent.click(await screen.findByTestId('drawer-line'))
  await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
  if (!screen.queryByTestId('stage-brief-input')) fireEvent.click(screen.getByTestId('stage-brief-view'))
  fireEvent.change(screen.getByTestId('stage-brief-input'), { target: { value: next } })
}

describe('the words drawer', () => {
  it('shows the scene prompt with its @chips on one line, collapsed under 800 px of window height', async () => {
    mount()
    const text = await screen.findByTestId('drawer-text')
    expect(text.textContent).toBe(BRIEF)
    expect(text.querySelector('.sd-chip')?.textContent).toBe('@maker')
    expect(screen.queryByTestId('stage-brief-card')).toBeNull() // collapsed: no edit box
  })

  it('opens at about three lines in a tall window, and a click on the line opens it in a short one', async () => {
    tall(1080)
    mount()
    expect(await screen.findByTestId('stage-brief-card')).toBeTruthy()
    cleanup(); resetDrawerChoice(); tall(720)
    mount()
    fireEvent.click(await screen.findByTestId('drawer-line'))
    expect(screen.getByTestId('stage-brief-card')).toBeTruthy()
    fireEvent.click(screen.getByTestId('drawer-hide'))
    expect(screen.getByTestId('drawer-line')).toBeTruthy()
  })

  it('an edit goes the Board\'s way: the scene draft gets the words, and the scene sheet gets the brief the next draw reads', async () => {
    const { io, bible } = mount()
    await edit(`${BRIEF} Then @maker lifts the bowl.`)
    await waitFor(() => expect(bible.save).toHaveBeenCalled()) // useV2Save: the sheet is told at once
    expect(bible.save.mock.calls.at(-1)![0]).toMatchObject({ worldId: WORLD })
    expect((bible.save.mock.calls.at(-1)![0] as { brief?: unknown }).brief).toBeTruthy()
    // the scene prompt too: the draw and the render read it (stage-only plan, section 5)
    expect((bible.save.mock.calls.at(-1)![0] as { prompt?: string }).prompt).toBe(`${BRIEF} Then @maker lifts the bowl.`)
    await act(settle)
    expect(io.saveDraft).toHaveBeenCalled()
    const saved = io.saveDraft.mock.calls.at(-1)![0] as unknown as Design
    expect(saved.brief).toBe(`${BRIEF} Then @maker lifts the bowl.`)
    expect(saved.edited).toBe(true)
  })

  it('a scene with no structured brief: an edit still sends its scene prompt to the sheet, once; opening sends nothing', async () => {
    const io = briefIo()
    io.loadDraft.mockImplementation(async () => ({ ...draft(), v2: null }) as unknown as DraftDesign)
    const { bible } = mount(io)
    fireEvent.click(await screen.findByTestId('drawer-line'))
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    expect(bible.save).not.toHaveBeenCalled()
    if (!screen.queryByTestId('stage-brief-input')) fireEvent.click(screen.getByTestId('stage-brief-view'))
    const next = `${BRIEF} The lamp is lit.`
    fireEvent.change(screen.getByTestId('stage-brief-input'), { target: { value: next } })
    await waitFor(() => expect(bible.save).toHaveBeenCalledTimes(1))
    expect(bible.save.mock.calls[0][0]).toEqual({ worldId: WORLD, prompt: next })
    await act(settle)
    expect(bible.save).toHaveBeenCalledTimes(1)
  })

  it('looking writes nothing: the draft read back is never saved again', async () => {
    const { io, bible } = mount()
    await screen.findByTestId('drawer-text')
    await act(settle)
    expect(io.loadDraft).toHaveBeenCalled()
    expect(io.saveDraft).not.toHaveBeenCalled()
    expect(bible.save).not.toHaveBeenCalled()
  })

  it('has no Draw press of its own: the one Draw the first frame press is the steps block\'s', async () => {
    mount()
    fireEvent.click(await screen.findByTestId('drawer-line'))
    expect(screen.getByTestId('stage-brief-card')).toBeTruthy()
    expect(screen.queryByTestId('drawer-redraw')).toBeNull()
    expect(screen.getByTestId('prompt-drawer').textContent).not.toMatch(/Redraw|Draw the first frame/)
  })

  it('shows the camera-language note under the box: Tidy strips just those phrases, Undo puts them back, × dismisses', async () => {
    mount()
    await edit(CAMERA_BRIEF)
    const note = await screen.findByTestId('camera-words-note')
    expect(note.textContent).toMatch(/The camera is set on the Stage, so these words may confuse the draw/)
    fireEvent.click(screen.getByTestId('camera-words-tidy'))
    await waitFor(() => expect((screen.getByTestId('stage-brief-input') as HTMLTextAreaElement).value).toBe('A quiet workshop at dawn.'))
    expect(screen.getByTestId('camera-words-undo')).toBeTruthy()
    fireEvent.click(screen.getByTestId('camera-words-undo'))
    await waitFor(() => expect((screen.getByTestId('stage-brief-input') as HTMLTextAreaElement).value).toBe(CAMERA_BRIEF))
    fireEvent.click(screen.getByTestId('camera-words-dismiss'))
    expect(screen.queryByTestId('camera-words-note')).toBeNull()
  })

  it('hints at @ while the words hold no tags; a tagged brief says nothing', async () => {
    const io = briefIo()
    io.loadDraft.mockImplementation(async () => ({ ...draft(), brief: 'A quiet workshop at dawn.', v2: null }) as unknown as DraftDesign)
    mount(io)
    fireEvent.click(await screen.findByTestId('drawer-line'))
    expect((await screen.findByTestId('no-tag-hint')).textContent).toBe('Type @ to tag a person or a prop from your scene.')
    cleanup(); resetDrawerChoice()
    mount() // BRIEF carries @maker
    fireEvent.click(await screen.findByTestId('drawer-line'))
    await screen.findByTestId('stage-brief-card')
    expect(screen.queryByTestId('no-tag-hint')).toBeNull()
  })

  it('the first words name a still-untitled scene once typing pauses, and follow them while the name is still that one; a name the owner gave is never touched', async () => {
    const calls: { url: string; body?: Record<string, unknown> }[] = []
    const doc = { id: SCENE, name: 'Untitled scene', revision: 3 }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `/__lab/scenes/${SCENE}`) return new Response(JSON.stringify({ ...doc, createdAt: 't', updatedAt: 't', worldId: null, worlds: [] }), { status: 200 })
      if (url === `/__lab/scenes/${SCENE}/rename`) {
        const body = JSON.parse(String(init?.body)); calls.push({ url, body }); doc.name = body.name; doc.revision += 1
        return new Response(JSON.stringify(doc), { status: 200 })
      }
      return new Response('null', { status: 404 })
    }))
    mount()
    await edit('J')
    fireEvent.change(screen.getByTestId('stage-brief-input'), { target: { value: 'A quiet workshop at dawn.' } })
    await waitFor(() => expect(calls).toEqual([{ url: `/__lab/scenes/${SCENE}/rename`, body: { name: 'A quiet workshop at dawn', revision: 3 } }])) // never "J"
    fireEvent.change(screen.getByTestId('stage-brief-input'), { target: { value: 'A quiet workshop at dusk.' } })
    await waitFor(() => expect(calls).toHaveLength(2)) // still the name set from the words: it follows them
    doc.name = 'My own name'
    fireEvent.change(screen.getByTestId('stage-brief-input'), { target: { value: 'A loud garage at noon.' } })
    await act(() => new Promise((r) => setTimeout(r, 900)))
    expect(calls).toHaveLength(2) // the owner's name stays
  })
})
