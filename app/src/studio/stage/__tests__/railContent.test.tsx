// @vitest-environment jsdom
// The option rail's content (layout wave L2): what the one selection opens — the performer's cast-card looks (a card per
// version, the last one current), a prop's pictures (its Bible element's refs, the built tile first and current), a plain
// kit piece's swap list (its own kind checked), the first-frame chip's Mood list (the plan's sky looks, the rest greyed);
// nothing picked opens nothing. The presses are the existing free routes, injected here (jsdom has none).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { KitWorld } from '../../../labs/projection/stage3d/kitApi'
import type { BibleApi } from '../../scene/bibleApi'
import type { PiecesApi } from '../../scene/piecesApi'
import type { SetPlaceState } from '../../scene/useSetPlace'
import type { KitItem, ScenePlan } from '../../../stage3d/contract'
import { DEFAULT_SKY } from '../../../stage3d/planRules'
import type { StagePick } from '../useStagePick'
import { useRailContent } from '../useRailContent'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
const world = { id: 'loc-1', description: 'd', plan, perf: { path: [], castId: 'beekeeper-x' }, still: null, masterDepth: null, createdAt: 't' } as unknown as KitWorld
const lab = { kit: { world } } as unknown as ProjectionLabState
const placeOf = (item: KitItem | null, swap = vi.fn(async () => {})): SetPlaceState =>
  ({ item, swap }) as unknown as SetPlaceState

interface Out { title: string; note: string | null; cards: { id: string; current: boolean; img: string | null; disabled: string | null; canApply: boolean }[] }
const snap = (): Out => JSON.parse(screen.getByTestId('rail-out').textContent || 'null')
const firstApply = () => fireEvent.click(screen.getByTestId('rail-apply-first'))

function Show({ pick, place, deps, at = lab }: { pick: StagePick | null; place: SetPlaceState; deps?: Parameters<typeof useRailContent>[0]['deps']; at?: ProjectionLabState }) {
  const c = useRailContent({ lab: at, pick, place, add: null, onPlaced: () => {}, onClose: () => {}, deps })
  const out: Out | null = c && {
    title: c.title, note: c.note ?? null,
    cards: c.cards.map((k) => ({ id: k.id, current: k.current, img: k.img, disabled: k.disabled ?? null, canApply: !!k.apply })),
  }
  return (
    <div>
      <div data-testid="rail-out">{JSON.stringify(out)}</div>
      <button type="button" data-testid="rail-apply-first" onClick={() => { const k = c?.cards.find((x) => x.apply); void k?.apply?.() }}>apply</button>
    </div>
  )
}

describe('the rail content per selection kind', () => {
  it('nothing picked (and no Mood): the rail stays closed', () => {
    render(<Show pick={null} place={placeOf(null)} />)
    expect(screen.getByTestId('rail-out').textContent).toBe('null')
  })

  it('the performer: their cast-card looks — a card per version, the last one current; Use this keeps the face', async () => {
    const brief = { saveCard: vi.fn(async () => {}) } as unknown as import('../../scene/briefApi').BriefApi
    render(<Show pick={{ t: 'mark' }} place={placeOf(null)} deps={{ brief }} />)
    await waitFor(() => expect(snap().cards.length).toBe(2))
    expect(snap().title).toBe('Beekeeper — options')
    expect(snap().cards.map((c) => [c.id, c.current])).toEqual([['v1', false], ['v2', true]])
    expect(snap().cards[0].img).toBe('/k/face-1.png')
    expect(snap().cards[0].canApply).toBe(true)
    firstApply()
    await waitFor(() => expect(brief.saveCard).toHaveBeenCalledWith({ cardId: 'beekeeper-x', name: 'Beekeeper', description: 'straw hat, smock', face: '/k/face-1.png' }))
  })

  it('the performer with nobody playing them: the line points at the person maker, with no gendered pronoun', async () => {
    const nobody = { kit: { world: { ...world, perf: { path: [] } } } } as unknown as ProjectionLabState
    // the scene's own person has no card in the project (yet): nobody to show
    const bible = { get: vi.fn(async () => ({ bible: { elements: [{ tag: 'cook', kind: 'cast', cardId: 'cook-9', refs: [], line: 'a cook' }] }, running: null })) } as unknown as import('../../scene/bibleApi').BibleApi
    render(<Show pick={{ t: 'mark' }} place={placeOf(null)} at={nobody} deps={{ bible }} />)
    await waitFor(() => expect(snap().note).toBe('Nobody plays the person yet: click them in the view to make their look.'))
    expect(snap().cards).toEqual([])
  })

  it('a plain kit piece: the swap list with its own kind checked; the press swaps the piece', async () => {
    const swap = vi.fn(async () => {})
    render(<Show pick={{ t: 'piece', index: 0 }} place={placeOf({ kind: 'rock', at: [0, 0] }, swap)} />)
    await waitFor(() => expect(snap().cards.length).toBeGreaterThan(3))
    expect(snap().title).toBe('rock — options')
    const cur = snap().cards.find((c) => c.current)!
    expect(cur.id).toBe('rock')
    expect(cur.canApply).toBe(false)
    firstApply()
    await waitFor(() => expect(swap).toHaveBeenCalled())
    expect(snap().cards.find((c) => c.canApply && !c.current)).toBeTruthy()
  })

  it('a built piece (a generated mesh, no board tag) offers nothing to swap', async () => {
    render(<Show pick={{ t: 'piece', index: 0 }} place={placeOf({ kind: 'hive', at: [0, 0], glb: { url: '/p/mesh.glb' } })} />)
    await waitFor(() => expect(snap().note).toContain('Built in 3D'))
    expect(snap().cards).toEqual([])
  })

  it('a prop: its pictures — the built tile first and current, the element’s other refs after', async () => {
    const bible: BibleApi = {
      get: vi.fn(async () => ({ bible: { worldId: 'loc-1', version: 1, prompt: '', master: null, candidates: [], elements: [{ tag: 'hive', kind: 'prop', refs: ['/e/hive-1.png', '/e/hive-2.png'], line: 'white-painted hive' }] }, running: null })),
      putElement: vi.fn(async () => ({ bible: null, running: null })),
    } as unknown as BibleApi
    const pieces: PiecesApi = { get: vi.fn(async () => ({ price: 12, tiles: [{ tag: 'hive', name: 'Hive', look: '/e/hive-2.png', status: 'placed' }], running: null, setChangedAt: null, stillStale: false })) } as unknown as PiecesApi
    render(<Show pick={{ t: 'piece', index: 0 }} place={placeOf({ kind: 'hive', at: [0, 0], pieceTag: 'prop:hive' })} deps={{ bible, pieces }} />)
    await waitFor(() => expect(snap().cards.length).toBe(2))
    expect(snap().title).toBe('hive — options')
    expect(snap().cards.map((c) => [c.img, c.current])).toEqual([['/e/hive-2.png', true], ['/e/hive-1.png', false]])
    firstApply()
    await waitFor(() => expect(bible.putElement).toHaveBeenCalledWith({ worldId: 'loc-1', element: { tag: 'hive', kind: 'prop', refs: ['/e/hive-1.png'], line: 'white-painted hive' } }))
  })
})
