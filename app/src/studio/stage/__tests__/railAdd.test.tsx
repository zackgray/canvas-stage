// @vitest-environment jsdom
// The rail's Add mode and the paid redraw (layout wave L3). Add mode: a marked spot and a chosen kind build "Add at the marked
// spot" — the kit's kinds place through the piece add route (a click places a piece and drops the mark), one of the set's props
// places as a labelled stand-in (crates + the prop's name), a drawn or uploaded candidate becomes the scene's own prop (its draft
// tile in the Stage's one design, its tagged stand-in, its one 3D build: stageProp.ts); a person is made in The subject's panel,
// so the Add menu has no person kind; the
// "+ Generate a prop" card carries the draw screen's press (briefApi.candidates — the same paid route the Board's piece details
// use) with the real price, and an upload lands as is, free. The redraw ("What should change?") appends the change
// to the card's words, shows its real price, and adds the results as NEW cards — the originals (and the scene) untouched until
// Use this keeps a look (briefApi.saveCard) or a tile (the Bible element rewrite).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conceptCredits } from '../../../shared/sceneContract'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { KitWorld } from '../../../labs/projection/stage3d/kitApi'
import type { BibleApi } from '../../scene/bibleApi'
import type { BriefApi } from '../../scene/briefApi'
import type { PiecesApi } from '../../scene/piecesApi'
import type { SetPlaceState } from '../../scene/useSetPlace'
import type { ScenePlan } from '../../../stage3d/contract'
import { DEFAULT_SKY } from '../../../stage3d/planRules'
import type { StagePick } from '../useStagePick'
import { useRailContent } from '../useRailContent'
import { resetAutoBuilds } from '../../scene/pieceAutoBuild'
import type { Piece } from '../../scene/design/model'
import type { StagePropDesign } from '../stageProp'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); resetAutoBuilds() }) // the NEW cards are kept per world (freshLooks.ts)

const CAST = {
  id: 'beekeeper-x', name: 'Beekeeper',
  versions: [
    { version: 1, created: 't1', payload: { name: 'Beekeeper', description: 'straw hat, smock', references: ['/k/face-1.png'], sheets: [] } },
    { version: 2, created: 't2', payload: { name: 'Beekeeper', description: 'canvas trousers', references: ['/k/face-2.png'], sheets: [] } },
  ],
}
const PROJECT = { id: 'default', name: 'Default', revision: 1, created: 't', ingredients: { cast: [CAST], looks: [], locations: [], props: [] }, shots: [] }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/__lab/project/') && url.endsWith('/bootstrap')) return new Response(JSON.stringify({ project: PROJECT, created: false }), { status: 200 })
    if (url.includes('/__lab/project/')) return new Response('null', { status: 404 })
    return new Response('{}', { status: 404 })
  }))
})

const plan: ScenePlan = { seed: 1, sentence: 'a grey morning', sky: { url: DEFAULT_SKY, look: 'dusk' }, kit: [] }
const propPlan: ScenePlan = { ...plan, kit: [{ kind: 'hive', at: [0, 0], pieceTag: 'prop:hive', label: 'Hive' }] }
const world = { id: 'loc-1', description: 'd', plan, perf: { path: [], castId: 'beekeeper-x' }, still: null, masterDepth: null, createdAt: 't' } as unknown as KitWorld
const propWorld = { ...world, plan: propPlan } as unknown as KitWorld
const lab = { kit: { world } } as unknown as ProjectionLabState
const propLab = { kit: { world: propWorld } } as unknown as ProjectionLabState
const defaultLab = lab
const placeOf = (o: Partial<SetPlaceState> = {}): SetPlaceState =>
  ({ item: null, swap: vi.fn(async () => {}), add: vi.fn(async () => {}), ...o }) as unknown as SetPlaceState

const briefOf = (urls = ['/d/1.png', '/d/2.png']): BriefApi => ({
  loadDraft: vi.fn(async () => ({ pieces: [] })),
  saveDraft: vi.fn(async () => {}),
  saveCard: vi.fn(async () => {}),
  candidates: vi.fn(async () => ({ urls })),
  uploadReference: vi.fn(async () => '/u/photo.png'),
}) as unknown as BriefApi
const bibleOf = (): BibleApi => ({
  get: vi.fn(async () => ({ bible: { worldId: 'loc-1', version: 1, prompt: '', master: null, candidates: [], elements: [{ tag: 'hive', kind: 'prop', refs: ['/e/hive-1.png'], line: 'white-painted hive' }] }, running: null })),
  putElement: vi.fn(async () => ({ bible: null, running: null })),
}) as unknown as BibleApi
const piecesOf = (): PiecesApi => ({
  get: vi.fn(async () => ({ price: 12, tiles: [{ tag: 'hive', name: 'Hive', look: '/e/hive-2.png', status: 'placed' }], running: null, setChangedAt: null, stillStale: false })),
  build: vi.fn(() => new Promise(() => {})), // a build in the air for the whole test: nothing is paid
}) as unknown as PiecesApi

interface Out { title: string; note: string | null; addPrice: number | null; cards: { id: string; name: string; desc: string; img: string | null; current: boolean; fresh: boolean; gen: string | null; disabled: string | null; canApply: boolean; redrawPrice: number | null }[] }
const snap = (): Out => JSON.parse(screen.getByTestId('rail-out').textContent || 'null')

function Show({ lab, pick, place, add, deps, onPlaced }: {
  lab?: ProjectionLabState; pick?: StagePick | null; place?: SetPlaceState; add?: { kind: 'prop' | 'piece'; at: [number, number] } | null
  deps?: Parameters<typeof useRailContent>[0]['deps']; onPlaced?: () => void
}) {
  const c = useRailContent({ lab: lab ?? defaultLab, pick: pick ?? null, place: place ?? placeOf(), add: add ?? null, onPlaced: onPlaced ?? (() => {}), onClose: () => {}, deps })
  const out: Out | null = c && {
    title: c.title, note: c.note ?? null, addPrice: c.add ? c.add.price(2) : null,
    cards: c.cards.map((k) => ({ id: k.id, name: k.name, desc: k.desc, img: k.img, current: k.current, fresh: !!k.fresh, gen: k.gen ?? null, disabled: k.disabled ?? null, canApply: !!k.apply, redrawPrice: k.redraw?.price ?? null })),
  }
  return (
    <div>
      <div data-testid="rail-out">{JSON.stringify(out)}</div>
      {c?.cards.map((k, i) => k.apply
        ? <button key={k.id} type="button" data-testid={`rail-apply-${i}`} onClick={() => void k.apply?.()}>apply {k.id}</button>
        : null)}
      {c?.cards.map((k, i) => k.redraw
        ? <button key={`r${k.id}`} type="button" data-testid={`rail-redraw-${i}`} onClick={() => void k.redraw?.run('red boots')}>redraw {k.id}</button>
        : null)}
      {c?.add && <button type="button" data-testid="rail-draw" onClick={() => void c.add!.draw('Grandson', 'a boy of nine', 2)}>draw</button>}
      {c?.upload && <button type="button" data-testid="rail-upload" onClick={() => void c.upload!(new File(['x'], 'p.png', { type: 'image/png' }))}>upload</button>}
    </div>
  )
}

describe('Add mode (L3)', () => {
  it('a set piece: the kit kinds, each placing a new piece at the spot through the add route; the mark drops', async () => {
    const add = vi.fn(async () => true) // the place route answers whether it placed
    const onPlaced = vi.fn()
    render(<Show place={placeOf({ add })} add={{ kind: 'piece', at: [1, 2] }} onPlaced={onPlaced} />)
    await waitFor(() => expect(snap().cards.length).toBeGreaterThan(3))
    expect(snap().title).toBe('Add at the marked spot')
    const card = snap().cards.find((c) => c.id === 'rock')!
    expect(card.canApply).toBe(true)
    fireEvent.click(screen.getByTestId(`rail-apply-${snap().cards.findIndex((c) => c.id === 'rock')}`))
    await waitFor(() => expect(add).toHaveBeenCalledWith('rock', [1, 2], undefined))
    expect(onPlaced).toHaveBeenCalled()
  })

  it('a prop: the set’s props place as labelled stand-ins (the 3D build has no route); the draw screen’s press shows the real price', async () => {
    const add = vi.fn(async () => true) // the place route answers whether it placed
    const brief = briefOf()
    render(<Show lab={propLab} place={placeOf({ add })} add={{ kind: 'prop', at: [1, 2] }} deps={{ bible: bibleOf(), pieces: piecesOf(), brief }} />)
    await waitFor(() => expect(snap().cards.some((c) => c.id.startsWith('prop:'))).toBe(true))
    const i = snap().cards.findIndex((c) => c.id.startsWith('prop:'))
    expect(snap().cards[i].img).toBe('/e/hive-2.png') // the built tile first
    fireEvent.click(screen.getByTestId(`rail-apply-${i}`))
    await waitFor(() => expect(add).toHaveBeenCalledWith('crates', [1, 2], 'Hive')) // a labelled stand-in
    // the gen card and its press: two draft concept candidates, the real price on the button
    expect(snap().cards[snap().cards.length - 1].gen).toBe('prop')
    expect(snap().addPrice).toBe(conceptCredits('draft', 2))
    fireEvent.click(screen.getByTestId('rail-draw'))
    await waitFor(() => expect(brief.candidates).toHaveBeenCalledWith({ type: 'prop', prompt: 'a boy of nine', count: 2, quality: 'draft', name: 'Grandson' }))
    await waitFor(() => expect(snap().cards.filter((c) => c.fresh).length).toBe(2)) // NEW cards, added not overwritten
    expect(snap().cards.find((c) => c.id.startsWith('prop:'))!.img).toBe('/e/hive-2.png') // the original still there
  })

  it('(F2) a picked drawn candidate becomes the scene’s prop: its draft tile, the tagged stand-in at the spot, its one 3D build', async () => {
    const brief = briefOf(['/d/1.png'])
    const add = vi.fn(async () => true)
    const pieces = piecesOf()
    const onPlaced = vi.fn()
    // the Stage's one design (draftWritersSeam.test.tsx runs the real one): the tile goes in there and its save lands first
    const tiles: Piece[] = []
    const design: StagePropDesign = { pieces: () => tiles, add: (t) => { tiles.push(t) }, drop: vi.fn(), saved: vi.fn(async () => {}) }
    render(<Show lab={propLab} place={placeOf({ add })} add={{ kind: 'prop', at: [1, 2] }} deps={{ bible: bibleOf(), pieces, brief, design }} onPlaced={onPlaced} />)
    await waitFor(() => expect(screen.getByTestId('rail-draw')).toBeTruthy())
    fireEvent.click(screen.getByTestId('rail-draw')) // draws "Grandson · look 1"
    await waitFor(() => expect(snap().cards.some((c) => c.fresh)).toBe(true))
    expect(pieces.build).not.toHaveBeenCalled() // never on the image draw
    fireEvent.click(screen.getByTestId(`rail-apply-${snap().cards.findIndex((c) => c.fresh)}`))
    await waitFor(() => expect(pieces.build).toHaveBeenCalledTimes(1))
    expect(tiles).toEqual([expect.objectContaining({ tag: 'grandson', type: 'prop', state: 'approved', looks: ['/d/1.png'] })])
    expect(design.saved).toHaveBeenCalledWith(tiles[0].id)
    expect(brief.saveDraft).not.toHaveBeenCalled() // the rail never writes the draft itself
    expect(add).toHaveBeenCalledWith('crates', [1, 2], 'Grandson', 'prop:grandson', { throws: true })
    expect(pieces.build).toHaveBeenCalledWith('loc-1', 'grandson')
    expect(onPlaced).toHaveBeenCalled()
  })

  it('an upload lands as a candidate as is, free', async () => {
    const brief = briefOf()
    render(<Show place={placeOf()} add={{ kind: 'prop', at: [1, 2] }} deps={{ bible: bibleOf(), pieces: piecesOf(), brief }} />)
    await waitFor(() => expect(screen.getByTestId('rail-upload')).toBeTruthy())
    fireEvent.click(screen.getByTestId('rail-upload'))
    await waitFor(() => expect(brief.uploadReference).toHaveBeenCalled())
    await waitFor(() => expect(snap().cards.some((c) => c.fresh && c.img === '/u/photo.png')).toBe(true))
  })
})

describe('the paid redraw (L3)', () => {
  it('a cast look: the price shows before the press; the change is appended as typed; NEW cards land beside the original', async () => {
    const brief = briefOf()
    render(<Show pick={{ t: 'mark' }} place={placeOf()} deps={{ brief }} />)
    await waitFor(() => expect(snap().cards.length).toBe(2))
    expect(snap().cards[0].redrawPrice).toBe(7) // one look now: 5 cold + 2
    fireEvent.click(screen.getByTestId('rail-redraw-0'))
    await waitFor(() => expect(brief.candidates).toHaveBeenCalledWith({ type: 'person', prompt: 'straw hat, smock, red boots', count: 1, name: 'Beekeeper · look 1' }))
    await waitFor(() => expect(snap().cards.length).toBe(4))
    const news = snap().cards.filter((c) => c.fresh)
    expect(news.length).toBe(2) // the mocked answer carries two urls; the REQUEST asked for one look
    expect(news[0].name).toContain('red boots')
    expect(news[0].desc).toBe('straw hat, smock, red boots')
    expect(snap().cards.find((c) => c.id === 'v2')!.current).toBe(true) // the originals untouched…
    expect(brief.saveCard).not.toHaveBeenCalled() // …and nothing in the scene changed
  })

  it('(Fable review, money) the NEW cards a paid redraw drew are still there after a reload (kept per set in this browser)', async () => {
    const brief = briefOf()
    const first = render(<Show pick={{ t: 'mark' }} place={placeOf()} deps={{ brief }} />)
    await waitFor(() => expect(snap().cards.length).toBe(2))
    fireEvent.click(screen.getByTestId('rail-redraw-0'))
    await waitFor(() => expect(snap().cards.filter((c) => c.fresh).length).toBe(2))
    first.unmount() // a reload, or leaving the Stage
    render(<Show pick={{ t: 'mark' }} place={placeOf()} deps={{ brief: briefOf() }} />)
    await waitFor(() => expect(snap().cards.filter((c) => c.fresh).map((c) => c.img)).toEqual(['/d/1.png', '/d/2.png']))
    expect(brief.candidates).toHaveBeenCalledTimes(1) // nothing drawn again
  })

  it('Use this on a NEW look keeps its face and appends the cast card’s next version (the existing L2 route)', async () => {
    const brief = briefOf()
    render(<Show pick={{ t: 'mark' }} place={placeOf()} deps={{ brief }} />)
    await waitFor(() => expect(snap().cards.length).toBe(2))
    fireEvent.click(screen.getByTestId('rail-redraw-0'))
    await waitFor(() => expect(snap().cards.length).toBe(4))
    const i = snap().cards.findIndex((c) => c.fresh)
    fireEvent.click(screen.getByTestId(`rail-apply-${i}`))
    await waitFor(() => expect(brief.saveCard).toHaveBeenCalledWith({ cardId: 'beekeeper-x', name: snap().cards[i].name, description: 'straw hat, smock, red boots', face: '/d/1.png' }))
  })

  it('a prop tile redraws through the draft concept route at its price, added NEW beside the built tile', async () => {
    const brief = briefOf(['/d/1.png'])
    render(<Show lab={propLab} pick={{ t: 'piece', index: 0 }} place={placeOf({ item: propPlan.kit[0] })} deps={{ brief, bible: bibleOf(), pieces: piecesOf() }} />)
    await waitFor(() => expect(snap().cards.length).toBe(2))
    const i = snap().cards.findIndex((c) => c.redrawPrice !== null)
    expect(snap().cards[i].redrawPrice).toBe(6) // one draft concept
    fireEvent.click(screen.getByTestId(`rail-redraw-${i}`))
    await waitFor(() => expect(brief.candidates).toHaveBeenCalledWith({ type: 'prop', prompt: 'white-painted hive, red boots', count: 1, quality: 'draft' }))
    await waitFor(() => expect(snap().cards.length).toBe(3))
    expect(snap().cards.filter((c) => c.fresh).length).toBe(1)
    expect(snap().cards[0].current).toBe(true) // the built tile is still the one in use
  })
})
