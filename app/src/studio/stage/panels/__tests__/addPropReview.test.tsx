// @vitest-environment jsdom
// Add a prop, reviewed in the dialog (add-prop-review, owner 2026-10-29): Draw shows the candidates IN the dialog, each with Use this
// one (the 3D build's price on it) and Draw another candidate (one more, the same words, its own price). Use this one places the
// prop at the marked spot (the labelled, tagged stand-in), starts its ONE build, and closes the dialog; a refusal keeps the dialog
// open and says why in plain words; a failed or empty draw says so; nothing is built on a draw; a double press builds once; the
// dialog's Escape waits for a draw in flight and never reaches the Stage's own Escape (which would drop the marked spot).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlan } from '../../../../stage3d/contract'
import { DEFAULT_SKY } from '../../../../stage3d/planRules'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { BibleApi } from '../../../scene/bibleApi'
import type { BriefApi } from '../../../scene/briefApi'
import type { Piece } from '../../../scene/design/model'
import type { PiecesApi } from '../../../scene/piecesApi'
import { act } from '@testing-library/react'
import { AUTO_WAIT, resetAutoBuilds, startAutoBuild } from '../../../scene/pieceAutoBuild'
import { PiecePanel } from '../PiecePanel'
import { AddDialog } from '../../AddDialog'
import type { StagePropDesign } from '../../stageProp'

beforeEach(() => { resetAutoBuilds(); vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); resetAutoBuilds() })

const plan: ScenePlan = { seed: 1, sentence: 'a yard', sky: { url: DEFAULT_SKY, look: 'dusk' }, kit: [] }
const world = { id: 'loc-r', description: 'd', plan, perf: { path: [], castId: null }, still: null, masterDepth: null, createdAt: 't' } as unknown as KitWorld
const lab = { kit: { id: 'loc-r', world, layer: null, perf: world.perf, error: null }, stage: null } as unknown as ProjectionLabState
const AT: [number, number] = [2.5, -7]

function mount(o: { urls?: string[][]; drawFails?: boolean; addFails?: string } = {}) {
  const answers = [...(o.urls ?? [['/d/1.png'], ['/d/2.png']])]
  const brief = {
    loadDraft: vi.fn(), saveDraft: vi.fn(), saveCard: vi.fn(), uploadReference: vi.fn(),
    candidates: vi.fn(async () => { if (o.drawFails) throw new Error('the cloud said no'); return { urls: answers.shift() ?? [] } }),
  } as unknown as BriefApi & { candidates: ReturnType<typeof vi.fn> }
  const pieces = { get: vi.fn(async () => ({ price: 8, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(() => new Promise(() => {})) } as unknown as PiecesApi & { build: ReturnType<typeof vi.fn> }
  const bible = { get: vi.fn(async () => ({ bible: null, running: null })), putElement: vi.fn(async () => ({ bible: null, running: null })) } as unknown as BibleApi
  const tiles: Piece[] = []
  const design: StagePropDesign = { pieces: () => tiles, add: (t) => { tiles.push(t) }, drop: vi.fn((id: string) => { tiles.splice(tiles.findIndex((t) => t.id === id), 1) }), saved: vi.fn(async () => {}) }
  const add = vi.fn(async (..._a: unknown[]) => { if (o.addFails) throw new Error(o.addFails); return true })
  const place = { item: null, swap: vi.fn(), add, error: null } as never
  const onClose = vi.fn()
  render(<AddDialog lab={lab} place={place} at={AT} kind="prop" onClose={onClose} deps={{ bible, pieces, brief, design }} />)
  return { brief, pieces, add, onClose, tiles }
}
async function drawCart() {
  fireEvent.click(await screen.findByTestId('add-card-+new'))
  fireEvent.change(screen.getByTestId('add-gen-name'), { target: { value: 'Cart' } })
  fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a green hand cart' } })
  fireEvent.click(screen.getByTestId('add-gen-draw'))
}

describe('Add a prop: the candidates are reviewed in the dialog', () => {
  it('a draw shows the picture with Use this one (its build price) and Draw another; approving places it at the spot, builds once and closes', async () => {
    const { brief, pieces, add, onClose, tiles } = mount()
    await drawCart()
    const shown = () => screen.getByTestId('add-gen-shown-img').getAttribute('src')
    await screen.findByTestId('add-gen-shown-img')
    expect(shown()).toBe('/d/1.png')
    expect(pieces.build).not.toHaveBeenCalled() // never on a draw
    await waitFor(() => expect(screen.getByTestId('add-gen-shown').textContent).toMatch(/Use this one.*8 cr/))
    expect(screen.getByTestId('add-gen-picks').textContent).toMatch(/Draw another candidate.*cr/)
    fireEvent.click(screen.getByTestId('add-gen-again')) // the same words, one more
    await waitFor(() => expect(brief.candidates).toHaveBeenCalledTimes(2))
    expect(brief.candidates.mock.calls[1][0]).toMatchObject({ type: 'prop', prompt: 'a green hand cart', count: 1, name: 'Cart' })
    await waitFor(() => expect(shown()).toBe('/d/2.png')) // the new one is selected as it lands
    // (prop-pick-view) a thumbnail only switches the large one: no viewer, no placement, no build
    fireEvent.click(screen.getByTestId('add-gen-thumb-0'))
    expect(shown()).toBe('/d/1.png')
    expect(screen.getByTestId('add-gen-thumb-0').getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByTestId('lightbox')).toBeNull()
    fireEvent.keyDown(screen.getByTestId('add-gen-thumb-0'), { key: 'ArrowRight' }) // the keyboard selects too
    expect(shown()).toBe('/d/2.png')
    expect(add).not.toHaveBeenCalled()
    expect(pieces.build).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('add-gen-use'))
    fireEvent.click(screen.getByTestId('add-gen-use')) // a double press
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith('crates', AT, 'Cart', 'prop:cart', { throws: true }) // the labelled stand-in at the marked spot
    expect(tiles).toEqual([expect.objectContaining({ tag: 'cart', state: 'approved', looks: ['/d/2.png'] })])
    expect(pieces.build).toHaveBeenCalledTimes(1)
    expect(pieces.build).toHaveBeenCalledWith('loc-r', 'cart')
  })

  it('a refusal keeps the dialog open and says why; nothing is built', async () => {
    const { pieces, onClose, tiles } = mount({ addFails: 'the set is locked by a take' })
    await drawCart()
    fireEvent.click(await screen.findByTestId('add-gen-use'))
    const err = await screen.findByTestId('add-gen-error')
    expect(err.textContent).toBe('The prop was not added: the set is locked by a take')
    expect(onClose).not.toHaveBeenCalled()
    expect(pieces.build).not.toHaveBeenCalled()
    expect(tiles).toEqual([]) // the tile went back out: a retry starts clean
    expect((screen.getByTestId('add-gen-use') as HTMLButtonElement).disabled).toBe(false)
  })

  it('a failed draw and an empty draw each say so in plain words', async () => {
    mount({ drawFails: true })
    await drawCart()
    expect((await screen.findByTestId('add-gen-error')).textContent).toBe('The draw did not work: the cloud said no')
    cleanup()
    mount({ urls: [[]] })
    await drawCart()
    expect((await screen.findByTestId('add-gen-done')).textContent).toMatch(/brought nothing back/)
    expect(screen.queryByTestId('add-gen-picks')).toBeNull()
  })

  it("Escape during a draw keeps the dialog (and never reaches the Stage's own Escape)", async () => {
    let answer!: (v: { urls: string[] }) => void
    const { brief, onClose } = mount()
    brief.candidates.mockImplementationOnce(() => new Promise((r) => { answer = r }))
    const stage = vi.fn()
    window.addEventListener('keydown', stage)
    await drawCart()
    await screen.findByTestId('add-gen-pill') // the draw in flight shows progress
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('add-gen')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(stage).not.toHaveBeenCalled()
    answer({ urls: ['/d/9.png'] })
    expect((await screen.findByTestId('add-gen-shown-img')).getAttribute('src')).toBe('/d/9.png')
    window.removeEventListener('keydown', stage)
  })
})

describe('after Use this one, the piece panel says where its 3D build stands', () => {
  const standIn = (tag: string) => ({ item: { kind: 'crates', at: [2.5, -7], label: 'Cart', pieceTag: `prop:${tag}` }, sel: 0, poseOf: () => null, error: null }) as never
  it('building, waiting its turn, then a refusal in plain words', async () => {
    let fail!: (e: Error) => void
    const api = { build: vi.fn(() => new Promise((_r, j) => { fail = j })) }
    act(() => { startAutoBuild(api as never, 'loc-r', 'cart') })
    act(() => { startAutoBuild(api as never, 'loc-r', 'barrow') })
    const r = render(<PiecePanel place={standIn('cart')} lab={lab} />)
    expect(screen.getByTestId('piece-build-state').textContent).toMatch(/Building it in 3D, about a minute/)
    r.rerender(<PiecePanel place={standIn('barrow')} lab={lab} />)
    expect(screen.getByTestId('piece-build-state').textContent).toBe(AUTO_WAIT)
    r.rerender(<PiecePanel place={standIn('cart')} lab={lab} />)
    await act(async () => { fail(new Error('Day budget reached')) })
    expect(screen.getByTestId('piece-build-failed').textContent).toMatch(/The 3D build did not run: Day budget reached/)
    expect(api.build).toHaveBeenCalledTimes(2) // the waiting one went next, once
  })
})

describe('a candidate seen large, over the dialog', () => {
  /** the z-index of the rule that starts with `sel` in a stylesheet */
  const zOf = (file: string, sel: string) => {
    const rule = readFileSync(resolve(process.cwd(), file), 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${sel} {`)) ?? ''
    return Number(/z-index: (\d+)/.exec(rule)?.[1])
  }

  it('a click on the large picture opens the viewer (never uses it); Escape closes the viewer only; its Use this one places it', async () => {
    const { add, onClose, pieces } = mount()
    await drawCart()
    fireEvent.click(await screen.findByTestId('add-gen-shown-view'))
    expect(screen.getByTestId('lightbox-img').getAttribute('src')).toBe('/d/1.png')
    expect(add).not.toHaveBeenCalled() // looking never uses it
    fireEvent.keyDown(screen.getByTestId('lightbox'), { key: 'Escape' })
    expect(screen.queryByTestId('lightbox')).toBeNull()
    expect(screen.getByTestId('add-dialog')).toBeTruthy() // the topmost layer only
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('add-gen-shown-view'))
    fireEvent.click(screen.getByTestId('lightbox-close')) // the close button
    expect(screen.queryByTestId('lightbox')).toBeNull()
    fireEvent.click(screen.getByTestId('add-gen-shown-view'))
    fireEvent.click(screen.getByTestId('lightbox')) // a click outside the picture
    expect(screen.queryByTestId('lightbox')).toBeNull()
    expect(screen.getByTestId('add-dialog')).toBeTruthy()
    fireEvent.click(screen.getByTestId('add-gen-shown-view'))
    fireEvent.click(screen.getByTestId('add-gen-lightbox-use'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(add).toHaveBeenCalledTimes(1)
    expect(pieces.build).toHaveBeenCalledTimes(1)
  })

  it('layer order: the viewer stacks above the object card and the Add dialog', () => {
    const dialog = zOf('src/studio/stage/panels/objectCard.css', '.st-obj-dim')
    const viewer = zOf('src/studio/ui/lightbox.css', '.st-lightbox')
    expect(dialog).toBeGreaterThan(20) // above the stage's own overlays
    expect(viewer).toBeGreaterThan(dialog)
  })
})

describe('a drawn candidate in the list behind the dialog', () => {
  it('a click on its card opens the review on it; it never places or builds by itself', async () => {
    localStorage.setItem('canvas-stage.stage-fresh.loc-r', JSON.stringify({ 'gen:prop': [
      { url: '/d/a.png', name: 'Cart · look 1', desc: 'a green hand cart' }, { url: '/d/b.png', name: 'Cart · look 2', desc: 'a green hand cart' }] }))
    const { add, pieces } = mount()
    fireEvent.click(await screen.findByTestId('add-card-gen:1'))
    expect(screen.getByTestId('add-gen-shown-img').getAttribute('src')).toBe('/d/b.png')
    expect((screen.getByTestId('add-gen-name') as HTMLInputElement).value).toBe('Cart')
    expect(screen.queryByTestId('lightbox')).toBeNull()
    expect(add).not.toHaveBeenCalled()
    expect(pieces.build).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('add-gen-use'))
    await waitFor(() => expect(add).toHaveBeenCalledWith('crates', AT, 'Cart', 'prop:cart', { throws: true }))
    expect(pieces.build).toHaveBeenCalledTimes(1)
  })
})
