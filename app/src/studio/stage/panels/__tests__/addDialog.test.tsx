// @vitest-environment jsdom
// The Add dialog (add-flow-no-home): the ground menu's Add choice opens the dialog (StagePanel hosts it), centred over a dimmed
// viewport like the object card. A set piece lists the kit kinds, a prop the set's own props and "+ Generate a prop"; a click on
// a card places it at the marked spot through the piece route and closes; Escape, the X and the dim close; a click never reaches
// a paid route (the draw is its own priced press, tested here against a mocked brief api only).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlan } from '../../../../stage3d/contract'
import { DEFAULT_SKY } from '../../../../stage3d/planRules'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { PlaceApi } from '../../../scene/setPlaceApi'
import type { BibleApi } from '../../../scene/bibleApi'
import type { BriefApi } from '../../../scene/briefApi'
import type { PiecesApi } from '../../../scene/piecesApi'
import { useSetPlace } from '../../../scene/useSetPlace'
import { AddDialog } from '../../AddDialog'
import { SWAP_KINDS } from '../../railModel'
import type { StageMark } from '../../railBus'
import { StagePanel } from '../StagePanel'

const calls: string[] = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response('null', { status: 404 }) }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const plan: ScenePlan = { seed: 1, sentence: 'a grey morning', sky: { url: DEFAULT_SKY, look: 'dusk' }, kit: [{ kind: 'hive', at: [0, 0], pieceTag: 'prop:hive', label: 'Hive' }] }
const world = { id: 'loc-1', description: 'd', plan, perf: { path: [], castId: null }, still: null, masterDepth: null, createdAt: 't' } as unknown as KitWorld
// the ground menu is portaled over the canvas' parent, so the lab needs one (its outside-press listener is what the dialog must outlive)
const canvas = document.createElement('canvas')
document.body.appendChild(document.createElement('div')).appendChild(canvas)
const lab = { kit: { id: 'loc-1', world, layer: null, perf: world.perf, error: null }, stage: { renderer: { domElement: canvas } } } as unknown as ProjectionLabState
const api = (): PlaceApi & { add: ReturnType<typeof vi.fn> } => ({ edit: vi.fn(async () => {}), add: vi.fn(async () => {}), mark: vi.fn(async () => {}), move: vi.fn(async () => {}) }) as never
const AT: [number, number] = [1, -6]
const menu = (kind: 'prop' | 'piece' | null): StageMark => ({ at: AT, px: { x: 30, y: 30 }, kind })

function Host({ a, m, chooseMenu }: { a: PlaceApi; m: StageMark; chooseMenu: (c: unknown) => void }) {
  const place = useSetPlace(world, a)
  return <StagePanel lab={lab} pick={null} select={vi.fn()} place={place} menu={m} chooseMenu={chooseMenu as never} />
}
const mount = (kind: 'prop' | 'piece' | null, a = api(), chooseMenu = vi.fn()) => { render(<Host a={a} m={menu(kind)} chooseMenu={chooseMenu} />); return { a, chooseMenu } }
const bibleOf = (): BibleApi => ({
  get: vi.fn(async () => ({ bible: { worldId: 'loc-1', version: 1, prompt: '', master: null, candidates: [], elements: [{ tag: 'hive', kind: 'prop', refs: ['/e/hive-1.png'], line: 'a hive' }] }, running: null })),
  putElement: vi.fn(async () => ({ bible: null, running: null })),
}) as never
const piecesOf = (): PiecesApi => ({ get: vi.fn(async () => ({ price: 12, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(() => new Promise(() => {})) }) as never
const briefOf = (): BriefApi => ({ loadDraft: vi.fn(), saveDraft: vi.fn(), saveCard: vi.fn(), candidates: vi.fn(async () => ({ urls: ['/d/1.png'] })), uploadReference: vi.fn() }) as never

describe('the Add dialog through the ground menu', () => {
  it('no dialog while the menu is just open (no Add kind chosen)', () => {
    mount(null)
    expect(screen.queryByTestId('add-dialog')).toBeNull()
  })

  it('A set piece: a dialog over a dimmed viewport lists every kit kind; a click places it at the marked spot and closes', async () => {
    const { a, chooseMenu } = mount('piece')
    expect(screen.getByTestId('add-dialog-dim')).toBeTruthy()
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    await waitFor(() => expect(screen.getAllByTestId(/^add-card-/).length).toBe(SWAP_KINDS.length))
    fireEvent.click(screen.getByTestId('add-card-rock'))
    await waitFor(() => expect(a.add).toHaveBeenCalledWith('loc-1', { kind: 'rock', at: AT }))
    await waitFor(() => expect(chooseMenu).toHaveBeenCalledWith({ do: 'close' }))
    expect(calls.filter((u) => /candidates|cast|jobs/.test(u))).toEqual([]) // a click never reaches a paid route
  })

  it('Escape, the X and the dim each close it', () => {
    for (const close of [
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      () => fireEvent.click(screen.getByTestId('add-dialog-x')),
      () => fireEvent.mouseDown(screen.getByTestId('add-dialog-dim')),
    ]) {
      const { chooseMenu } = mount('piece')
      close()
      expect(chooseMenu).toHaveBeenCalledWith({ do: 'close' })
      cleanup()
    }
  })

  it('a press inside the card does not close it (only the dim itself does)', () => {
    const { chooseMenu } = mount('piece')
    fireEvent.mouseDown(screen.getByTestId('add-dialog'))
    fireEvent(screen.getByTestId('add-dialog'), new MouseEvent('pointerdown', { bubbles: true, button: 0 })) // the ground menu's outside-press listener must stay quiet
    expect(chooseMenu).not.toHaveBeenCalled()
  })
})

describe('the prop list and Generate a prop', () => {
  const props = () => {
    const brief = briefOf()
    const place = { item: null, swap: vi.fn(), add: vi.fn(async () => true) } as never
    const onClose = vi.fn()
    render(<AddDialog lab={lab} place={place} at={AT} kind="prop" onClose={onClose} deps={{ bible: bibleOf(), pieces: piecesOf(), brief }} />)
    return { brief, place: place as { add: ReturnType<typeof vi.fn> }, onClose }
  }

  it('lists the set props and the Generate card; a prop places as a labelled stand-in at the spot', async () => {
    const { place, onClose } = props()
    await waitFor(() => expect(screen.getByTestId('add-card-prop:0')).toBeTruthy())
    expect(screen.getByTestId('add-card-+new')).toBeTruthy()
    fireEvent.click(screen.getByTestId('add-card-prop:0'))
    await waitFor(() => expect(place.add).toHaveBeenCalledWith('crates', AT, 'Hive'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Generate a prop opens the draw screen with its price; opening it spends nothing, only Draw does; Escape steps back, then closes', async () => {
    const { brief, onClose } = props()
    await waitFor(() => expect(screen.getByTestId('add-card-+new')).toBeTruthy())
    fireEvent.click(screen.getByTestId('add-card-+new'))
    expect(brief.candidates).not.toHaveBeenCalled()
    expect(screen.getByTestId('add-gen-draw').textContent).toBe('Draw 1 candidate')
    expect(screen.getByTestId('add-gen').textContent).toMatch(/cr/) // the real price is on the button
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a green hand cart' } })
    expect(brief.candidates).not.toHaveBeenCalled() // typing never draws
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('add-gen')).toBeNull() // back to the cards, dialog still open
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('the Draw press (mocked) shows the candidate in the dialog, and keeps it in the list as a NEW card', async () => {
    const { brief } = props()
    await waitFor(() => expect(screen.getByTestId('add-card-+new')).toBeTruthy())
    fireEvent.click(screen.getByTestId('add-card-+new'))
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a green hand cart' } })
    fireEvent.click(screen.getByTestId('add-gen-draw'))
    await waitFor(() => expect(brief.candidates).toHaveBeenCalledTimes(1))
    expect((await screen.findByTestId('add-gen-shown-img')).getAttribute('src')).toBe('/d/1.png')
    fireEvent.click(screen.getByTestId('add-gen-cancel'))
    await waitFor(() => expect(screen.getByTestId('add-card-gen:0')).toBeTruthy())
  })
})
