// @vitest-environment jsdom
// The take's words changed since its first frame was drawn, and nothing else did (wordsOnFrame.ts): the first-frame window's Render clip
// press (RenderClip, owner 10-29) becomes a plain line and two priced presses. Redraw runs the Stage's own draw press; "Render the new words on this frame" is one
// POST with wordsOnFrame. A stale frame for any other reason (a set change) keeps the bare refusal with no words option, and the
// Render page says the choice in words. Routes faked as pieceBuilding.test.tsx fakes them: nothing is sent anywhere, nothing spent.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { L2RListResponse, L2RMissing, L2RRender, TakeRecord } from '../../../shared/shotContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import type { PiecesApi } from '../../scene/piecesApi'
import { L2RBlock } from '../../render/L2RBlock'
import { resetL2RStore } from '../../render/l2rStore'
import type { L2RStatusExtra } from '../../render/l2rExtra'
import { publishHero, type HeroPressModel } from '../../shoot/heroPublished'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { RenderClip } from '../RenderClip'
import { useStageRender } from '../useStageRender'
import { setPieceBuildApi } from '../pieceBuilding'

const TAKE = 'take-2026-10-22T19-00-00-000'
const takeRec: TakeRecord = { id: TAKE, worldId: 'loc-1', packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt: '2026-10-22T19:00:00.000Z', createdAt: '2026-10-22T19:00:00.000Z' }
const WORDS: L2RMissing = { code: 'words_changed', message: 'The words changed since this first frame was drawn.', where: 'Redraw the first frame from the new words, or render the new words on this frame.' }
const SET: L2RMissing = { code: 'clay_set_moved', message: 'The set has changed since these frames were prepared.', where: 'Prepare the frames (free).' }
const done: L2RRender = { id: 'l2r-1', takeId: TAKE, stillId: 'still-1', clay: '/clay.mp4', raw: '/raw.mp4', finished: '/fin.mp4', jobId: 'job-12345678', credits: 21, status: 'done', createdAt: 't' }
const status = (missing: L2RMissing[], renders: L2RRender[] = []): L2RListResponse & L2RStatusExtra => ({ renders, take: takeRec,
  clay: { takeId: TAKE, startKey: 'k', mp4: '/clay.mp4', frames: 97, width: 1920, height: 1088, status: 'done' },
  still: { id: 'still-1', takeId: TAKE, startKey: 'k', png: '/s.png', seed: 1, jobId: null, credits: 1, approved: true, createdAt: 't' }, missing, prompt: 'A car stops beside it.', configured: true,
  estimate: { credits: 21, perFrame: 0.21, frames: 97, basis: 'about 0.21 cr per frame' }, running: null, finishing: [] })
const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

let l2r: L2RListResponse & L2RStatusExtra
let posts: { url: string; body: Record<string, unknown> }[]
const pieces: PiecesApi = { get: vi.fn(async () => ({ price: 12, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(), recover: vi.fn(), complete: vi.fn() }
const lab = () => ({
  op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
  stage: null, kit: { id: 'loc-1', world: null }, s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
  performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
}) as unknown as ProjectionLabState
/** the window's Render clip press, read as the Stage reads it */
const Clip = ({ lab }: { lab: ProjectionLabState }) => <RenderClip r={useStageRender(lab)} />
const press = (o: Partial<HeroPressModel> = {}): HeroPressModel => ({ price: 21, drawing: false, phase: null, since: null, gate: null, title: 'Draws the first frame', disabled: false, onPress: vi.fn(), ...o })

beforeEach(() => {
  posts = []; l2r = status([WORDS]); setCurrentTake(TAKE); setPieceBuildApi(pieces)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return ok({ takes: [takeRec] })
    if (String(url).startsWith('/__lab/l2r?take=')) return ok(l2r)
    if (init?.method === 'POST') { posts.push({ url: String(url), body: JSON.parse(String(init.body)) }); return ok({ render: { ...done, id: 'l2r-2', wordsDiffer: true } }) }
    return ok({ error: 'no' }, 404)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); publishHero(null); setPieceBuildApi(null); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); localStorage.clear() })

describe('the words changed since the first frame', () => {
  it('the Render press becomes the line and two priced presses; Redraw runs the draw press, and nothing is sent', async () => {
    const p = press()
    publishHero({ prompt: null as never, overlay: null, press: p })
    render(<Clip lab={lab()} />)
    expect((await screen.findByTestId('words-choice-line')).textContent).toBe('The words changed since this first frame was drawn.')
    expect(screen.queryByTestId('render-primary')).toBeNull()
    const redraw = screen.getByTestId('words-redraw') as HTMLButtonElement
    const go = screen.getByTestId('words-render') as HTMLButtonElement
    expect(redraw.parentElement?.textContent).toBe('Redraw the first frame≈ 21 cr')
    expect(go.parentElement?.textContent).toBe('Render the new words on this frame≈ 21 cr')
    await waitFor(() => expect(go.disabled).toBe(false))
    fireEvent.click(redraw)
    expect(p.onPress).toHaveBeenCalledTimes(1)
    expect(posts).toEqual([])
  })

  it('"Render the new words on this frame" is one POST that says wordsOnFrame', async () => {
    publishHero({ prompt: null as never, overlay: null, press: press() })
    render(<Clip lab={lab()} />)
    const go = await screen.findByTestId('words-render') as HTMLButtonElement
    await waitFor(() => expect(go.disabled).toBe(false))
    await act(async () => { fireEvent.click(go) })
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({ url: '/__lab/l2r', body: { takeId: TAKE, stillId: 'still-1', seed: 42, hold: 'wide', wordsOnFrame: true } })
  })

  it('after a done render, Render again becomes the same choice (never a bare press the server would refuse)', async () => {
    l2r = status([WORDS], [done])
    publishHero({ prompt: null as never, overlay: null, press: press() })
    render(<Clip lab={lab()} />)
    expect(await screen.findByTestId('words-choice')).toBeTruthy()
    expect(screen.queryByTestId('l2r-render-again')).toBeNull()
    expect(screen.queryByTestId('render-primary')).toBeNull()
  })

  it('a set change keeps the bare refusal: no words option at all', async () => {
    l2r = status([SET, WORDS])
    publishHero({ prompt: null as never, overlay: null, press: press() })
    render(<Clip lab={lab()} />)
    const rnd = await screen.findByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(rnd.disabled).toBe(true))
    expect(screen.queryByTestId('words-choice')).toBeNull()
    expect(screen.queryByTestId('words-render')).toBeNull()
  })

  it('with the words unchanged the press is the plain Render, as before', async () => {
    l2r = status([])
    publishHero({ prompt: null as never, overlay: null, press: press() })
    render(<Clip lab={lab()} />)
    const rnd = await screen.findByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(rnd.disabled).toBe(false))
    expect(rnd.textContent).toBe('Render clip')
    expect(rnd.parentElement?.textContent).toMatch(/21 cr/)
    expect(screen.queryByTestId('words-choice')).toBeNull()
  })

  it('the Render page says the choice in words, keeps the frame on show and names no gap for it', async () => {
    render(<L2RBlock lab={lab()} />)
    await screen.findByTestId('l2r-still')
    expect(screen.queryByTestId('l2r-missing-words_changed')).toBeNull()
    expect(screen.getByTestId('l2r-clay')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('l2r-status').textContent).toBe(
      "The words changed since this first frame was drawn. In the first frame's window on the Stage, redraw the first frame from the new words or render the new words on this frame (≈ 21 cr)."))
  })
})
