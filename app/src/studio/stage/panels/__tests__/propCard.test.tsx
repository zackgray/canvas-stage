// @vitest-environment jsdom
// The prop card (object card wave): the one dialog the picked prop opens — its pictures (a click opens the large review and NEVER
// spends), its words, the build states from the mock (not built = one yellow 'Use this one - build in 3D' with the server's price;
// built = a quiet disabled 'Built' with no price and the badge on the source picture; a different picture picked or the words
// edited after a build = one yellow 'Rebuild from this picture' with its price, the replaces line, the mismatch note and a free
// Model history with 'Go back to this model' — a free re-place of that run's mesh through the existing complete route), the
// Picture | 3D preview toggle (disabled before the build) and 'Generate more pictures' (one paid draft draw, mocked here: nothing
// is pressed for real). Against one fake draft route, a fake sheet and the fake pieces route.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneJobs } from '../../../../jobs/sceneJobs'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { DraftDesign } from '../../../../shared/sceneContract'
import type { KitItem } from '../../../../stage3d/contract'
import { blank, fakeApi, WORLD } from '../../../scene/__tests__/fakes'
import { briefApi } from '../../../scene/briefApi'
import { mkPiece } from '../../../scene/design/model'
import { freshDesign, type Design } from '../../../scene/design/state'
import type { SetPlaceState } from '../../../scene/useSetPlace'
import type { PiecesApi, PieceRecord } from '../../../scene/piecesApi'
import { PropCard } from '../propCard'
import { setPieceBuildApi } from '../../pieceBuilding'
import { StageSceneProvider } from '../../scene/StageScene'

const SCENE = 'sc-test-prop'
const TAG = 'loco'
const PIC = '/lab-assets/props/loco-1.png'
const PIC2 = '/lab-assets/props/loco-2.png'
const WORDS = 'a small shunting locomotive in faded green'
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const LAB = { kit: { id: WORLD, world: null } } as unknown as ProjectionLabState
const KIT_ITEM = { kind: 'crates', at: [2, -3] as [number, number], label: 'Locomotive', pieceTag: 'prop:loco' } as KitItem

const RECORD: PieceRecord = { world: WORLD, tag: TAG, run: 'p-20261028000001-abcd', kind: 'locomotive', url: '/mesh/loco.glb', massingUrl: null, jobId: null, credits: 8, placed: 'replaced', placedAt: 't' }
const placedTile = () => ({ tag: TAG, name: 'Locomotive', look: PIC, status: 'placed' as const, run: RECORD.run, piece: RECORD })

/** the draft route in memory (the design tile the card's writes land on) */
function server(design: Design) {
  let rec = { design: design as unknown as DraftDesign, revision: 1, updatedAt: 't' }
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
    if (url.startsWith('/__lab/scene/draft?project=')) return ok({ draft: rec })
    if (url === '/__lab/scene/draft' && init?.method === 'POST') {
      rec = { design: body.design as DraftDesign, revision: rec.revision + 1, updatedAt: 't' }
      return ok({ draft: rec })
    }
    if (url === '/__lab/scene/concepts') return ok({ urls: ['/lab-assets/props/loco-new.png'] })
    return ok({ error: 'no' }, 404)
  })
  return { f, now: () => rec.design as unknown as Design }
}

function piecesOf(o: { tiles?: unknown[]; build?: PiecesApi['build']; complete?: PiecesApi['complete'] } = {}): PiecesApi {
  return {
    get: vi.fn(async () => ({ price: 8, running: null, setChangedAt: null, stillStale: false, tiles: o.tiles ?? [] })),
    build: o.build ?? vi.fn(async () => RECORD),
    recover: vi.fn(),
    complete: o.complete ?? vi.fn(async () => RECORD),
  } as unknown as PiecesApi
}

const world: KitWorld = { id: WORLD, description: 'd', plan: { seed: 1, sentence: 'a grey yard', sky: { url: '/sky.png', look: 'dusk' }, kit: [KIT_ITEM] }, perf: { path: [[0, 0]] }, still: null, createdAt: 't' } as unknown as KitWorld
const designWith = (looks: string[], look = 0): Design => ({
  ...freshDesign(), screen: 'board', phase: 'board',
  pieces: [mkPiece(TAG, 'Locomotive', 'prop', { state: 'approved', looks, look, line: WORDS, onBoard: true })],
})

let srv: ReturnType<typeof server>
let jobs: SceneJobs
beforeEach(() => {
  localStorage.clear()
  jobs = new SceneJobs(null)
  setPieceBuildApi({ get: vi.fn(async () => ({ price: 8, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(), recover: vi.fn(), complete: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) // no project
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setPieceBuildApi(null); localStorage.clear() })

function mount(pieces: PiecesApi) {
  const bible = fakeApi({ ...blank(WORLD), elements: [{ tag: TAG, kind: 'prop', refs: [PIC], line: WORDS }] })
  const api = briefApi(srv.f as never, SCENE)
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => srv.f(String(input), init))) // the card's own draw route (the paid call is mocked here)
  const place = { item: KIT_ITEM } as unknown as SetPlaceState
  const r = render(
    <StageSceneProvider scene={SCENE} worldId={WORLD} lab={LAB} deps={{ api, bible: bible.api, jobs }}>
      <PropCard place={place} lab={{ kit: { world } } as unknown as ProjectionLabState} pieces={pieces} onClose={() => {}} />
    </StageSceneProvider>)
  return { bible, r }
}
const modelKey = `canvas-stage.stage-models.${WORLD}`

describe('the prop card, not built', () => {
  it('one yellow build press with the server price; the 3D preview toggle waits for the build; a click on a picture only reviews it', async () => {
    srv = server(designWith([PIC]))
    const pieces = piecesOf({ tiles: [{ tag: TAG, name: 'Locomotive', look: PIC, status: 'none' }] })
    mount(pieces)
    const go = await screen.findByTestId('piece-build-go')
    expect(go.textContent).toBe('Use this one - build in 3D')
    expect(go.className).toContain('st-primary') // the one yellow press
    expect(go.parentElement?.textContent).toContain('about 8 cr')
    expect((screen.getByTestId('prop-view-3d') as HTMLButtonElement).disabled).toBe(true)
    // the picture is still loading or shown, never a flat blank card
    expect(screen.queryByTestId('prop-main') ?? screen.queryByTestId('prop-main-wait')).toBeTruthy()
    // (prop-pick-view) a thumbnail only picks; the large picture opens the large review; nothing is spent by looking
    fireEvent.click(await screen.findByTestId('prop-pic-0'))
    expect(screen.queryByTestId('lightbox')).toBeNull()
    fireEvent.click(screen.getByTestId('prop-main-view'))
    expect(await screen.findByTestId('lightbox')).toBeTruthy()
    expect(pieces.build).not.toHaveBeenCalled()
    expect(vi.mocked(pieces.get).mock.calls.length).toBeGreaterThan(0) // no paid call: only the free state reads
  })

  it('the press builds through the pieces route and says it is building; a refusal says so in words and the press stays', async () => {
    srv = server(designWith([PIC]))
    let finish: () => void = () => {}
    const pieces = piecesOf({ tiles: [{ tag: TAG, name: 'Locomotive', look: PIC, status: 'none' }],
      build: vi.fn(() => new Promise<PieceRecord>((r) => { finish = () => r(RECORD) })) as unknown as PiecesApi['build'] })
    mount(pieces)
    fireEvent.click(await screen.findByTestId('piece-build-go'))
    await waitFor(() => expect(pieces.build).toHaveBeenCalledWith(WORLD, TAG))
    expect(screen.getByTestId('piece-build-pill')).toBeTruthy()
    expect(screen.queryByTestId('piece-build-go')).toBeNull()
    await act(async () => { finish() })

    const refused = piecesOf({ tiles: [{ tag: TAG, name: 'Locomotive', look: PIC, status: 'none' }],
      build: vi.fn(async () => { throw new Error('another paid job is running') }) as unknown as PiecesApi['build'] })
    cleanup()
    srv = server(designWith([PIC]))
    mount(refused)
    fireEvent.click(await screen.findByTestId('piece-build-go'))
    await waitFor(() => expect(screen.getByTestId('piece-build-error').textContent).toMatch(/did not finish.*another paid job is running/))
    expect(screen.getByTestId('piece-build-go')).toBeTruthy()
  })
})

describe('the prop card, built', () => {
  it('a quiet Built with no price and the badge on the source picture; the toggle opens the grey preview', async () => {
    srv = server(designWith([PIC]))
    localStorage.setItem(modelKey, JSON.stringify({ loco: [{ run: RECORD.run, from: PIC, text: WORDS, url: RECORD.url, at: 't' }] }))
    mount(piecesOf({ tiles: [placedTile()] }))
    const built = await screen.findByTestId('piece-built')
    expect(built.textContent).toBe('Built ✓')
    expect(built.className).not.toContain('st-primary')
    expect(built.parentElement?.textContent).not.toContain('cr') // no price on the quiet state
    expect(screen.getByTestId('prop-built-badge')).toBeTruthy() // the badge on the source picture
    const three = screen.getByTestId('prop-view-3d') as HTMLButtonElement
    expect(three.disabled).toBe(false)
    fireEvent.click(three)
    await waitFor(() => expect(screen.queryByTestId('model-preview') ?? screen.queryByTestId('model-preview-fallback')).toBeTruthy())
  })

  it('a different picture picked after the build: one yellow Rebuild with its price, the replaces line and the free model history', async () => {
    srv = server(designWith([PIC, PIC2]))
    localStorage.setItem(modelKey, JSON.stringify({ loco: [{ run: RECORD.run, from: PIC, text: WORDS, url: RECORD.url, at: 't' }] }))
    const pieces = piecesOf({ tiles: [placedTile()] })
    const { bible } = mount(pieces)
    await screen.findByTestId('piece-built')
    expect(screen.queryByTestId('piece-build-go')).toBeNull() // nothing to pay while it matches
    fireEvent.click(await screen.findByTestId('prop-pic-1')) // pick the other picture (free)
    await waitFor(() => expect(screen.getByTestId('piece-build-go').textContent).toBe('Rebuild from this picture'))
    expect(screen.getByTestId('piece-build-go').className).toContain('st-primary')
    expect(screen.getByTestId('piece-build').textContent).toContain('about 8 cr')
    expect(screen.getByTestId('piece-build').textContent).toContain('replaces the current 3D model')
    expect(screen.getByTestId('piece-models').textContent).toContain('Model history')
    expect(screen.getByTestId('piece-models').textContent).toContain('Going back is free')
    expect(screen.queryByTestId('piece-model-back-0')).toBeNull() // the current model has no go-back
    // the pick rewrote the element's picture through the existing route (free)
    await waitFor(() => expect(bible.api.putElement).toHaveBeenCalledWith(expect.objectContaining({ worldId: WORLD, element: expect.objectContaining({ tag: TAG, refs: [PIC2, PIC] }) })))
  })

  it('the words edited after a build: the mismatch note; going back to an older model is a free re-place of its run', async () => {
    srv = server(designWith([PIC, PIC2]))
    const OLD = { run: 'p-20261027000000-old', from: PIC2, text: WORDS, url: '/mesh/loco-old.glb', at: 't' }
    localStorage.setItem(modelKey, JSON.stringify({ loco: [{ run: RECORD.run, from: PIC, text: WORDS, url: RECORD.url, at: 't' }, OLD] }))
    const pieces = piecesOf({ tiles: [placedTile()] })
    const { bible } = mount(pieces)
    await screen.findByTestId('piece-built')
    fireEvent.change(screen.getByTestId('prop-words'), { target: { value: 'a small shunting locomotive in bright red' } })
    await waitFor(() => expect(screen.getByTestId('piece-build-stale').textContent).toContain('no longer matches these words'))
    // the older model offers a free way back
    const back = screen.getByTestId('piece-model-back-1')
    fireEvent.click(back)
    await waitFor(() => expect(pieces.complete).toHaveBeenCalledWith(WORLD, TAG, OLD.run)) // free: re-places that run's mesh
    await waitFor(() => expect(bible.api.putElement).toHaveBeenCalledWith(expect.objectContaining({ element: expect.objectContaining({ refs: expect.arrayContaining([PIC2]) }) })))
  })

  it('Generate more pictures: one paid draft draw (mocked), the new picture lands in the strip', async () => {
    srv = server(designWith([PIC]))
    mount(piecesOf({ tiles: [{ tag: TAG, name: 'Locomotive', look: PIC, status: 'none' }] }))
    const more = await screen.findByTestId('prop-more')
    expect(more.textContent).toBe('Generate more pictures')
    expect(more.parentElement?.textContent).toContain('cr')
    expect((more as HTMLButtonElement).disabled).toBe(false) // the words are there
    fireEvent.click(more)
    await waitFor(() => expect(screen.getByTestId('prop-pic-1')).toBeTruthy()) // the drawn picture joined the history
    expect(screen.getByTestId('prop-pic-1').textContent).toBeTruthy()
  })
})

describe("the prop card's ADVANCED: the same boxes as the Add dialog's (prop-draw-parts)", () => {
  it('an edit stays as typed, a cleared part is left out, and the exact words show before the press and go with it', async () => {
    srv = server(designWith([PIC]))
    mount(piecesOf({ tiles: [{ tag: TAG, name: 'Locomotive', look: PIC, status: 'none' }] }))
    fireEvent.click(await screen.findByTestId('object-tab-advanced'))
    const view = await screen.findByTestId('prop-part-view') as HTMLTextAreaElement
    expect(view.value).toBe('seen flat on from the front and standing upright')
    fireEvent.change(view, { target: { value: view.value.slice(0, -1) } }) // one Backspace
    expect((screen.getByTestId('prop-part-view') as HTMLTextAreaElement).value).toBe('seen flat on from the front and standing uprigh') // no snap back
    fireEvent.change(screen.getByTestId('prop-part-view'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('prop-part-setup'), { target: { value: 'centred on a plain neutral mid-grey background, low warm sun' } })
    fireEvent.click(screen.getByTestId('object-tab-look'))
    const sent = await screen.findByTestId('prop-more-sent')
    expect(sent.textContent).toBe(`What will be sent: A product photograph of ${WORDS}, centred on a plain neutral mid-grey background, low warm sun, no hand, nothing else in the picture. Real photographic detail.`)
    fireEvent.click(screen.getByTestId('prop-more'))
    await waitFor(() => expect(srv.f.mock.calls.some(([u]) => u === '/__lab/scene/concepts')).toBe(true))
    const body = JSON.parse(String(srv.f.mock.calls.find(([u]) => u === '/__lab/scene/concepts')![1]!.body)) as { description: string; parts: unknown }
    expect(body).toMatchObject({ description: WORDS, parts: { view: '', setup: 'centred on a plain neutral mid-grey background, low warm sun', light: '' } })
  })
})

