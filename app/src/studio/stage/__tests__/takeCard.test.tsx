// @vitest-environment jsdom
// The take card beside the Prompt box (owner 10-29): it follows the take the Prompt box names. A take with a first frame shows that
// frame ("First frame ✓", "· carried over" for one carried from an earlier lock) and a click opens the first-frame window; a take
// with none shows "Draw the first frame" with its price; a done render shows "Clip · N s ▶". There is no Approve press anywhere on
// the Stage (the steps line, the card, the window). The hero and frame-edit models are published fakes; the l2r route is faked.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { L2RListResponse, L2RRender, TakeRecord } from '../../../shared/shotContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { resetL2RStore } from '../../render/l2rStore'
import type { L2RStatusExtra } from '../../render/l2rExtra'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetFrameView } from '../../shoot/firstFrameView'
import { HeroOverlay } from '../../shoot/HeroOverlay'
import { publishHero, type HeroOverlayModel, type HeroPressModel, type HeroPublished } from '../../shoot/heroPublished'
import { publishFrameEdit } from '../frameEditStore'
import { ShotSteps } from '../panels/ShotSteps'
import { TakeCard } from '../TakeCard'
import type { FrameEditModel, FrameVersion } from '../useFrameEdit'

const A = 'take-2026-10-22T19-00-00-000'
const B = 'take-2026-10-22T20-00-00-000'
const takeRec = (id: string): TakeRecord => ({ id, worldId: 'loc-1', packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt: '2026-10-22T19:00:00.000Z', createdAt: '2026-10-22T19:00:00.000Z' })
const done: L2RRender = { id: 'l2r-1', takeId: A, stillId: 'a-1', clay: '/clay.mp4', raw: '/raw.mp4', finished: '/fin.mp4', jobId: 'job-1', credits: 21, status: 'done', createdAt: 't', frames: 96 }
const ready = (take: string, o: Partial<L2RListResponse & L2RStatusExtra> = {}): L2RListResponse & L2RStatusExtra => ({ renders: [], take: takeRec(take),
  clay: { takeId: take, startKey: 'k', mp4: '/clay.mp4', frames: 97, width: 1920, height: 1088, status: 'done' },
  still: { id: 'a-1', takeId: take, startKey: 'k', png: '/a1.png', seed: 1, jobId: null, credits: 1, approved: true, createdAt: 't' }, missing: [], prompt: 'A man.', configured: true,
  estimate: { credits: 21, perFrame: 0.21, frames: 97, basis: 'about 0.21 cr per frame' }, running: null, finishing: [], ...o })

let l2r: Record<string, L2RListResponse & L2RStatusExtra>
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
function serveL2R() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u === '/__lab/takes') return ok({ takes: [takeRec(A), takeRec(B)] })
    if (u.startsWith('/__lab/l2r?take=')) return ok(l2r[decodeURIComponent(u.split('take=')[1].split('&')[0])] ?? ready(B))
    return ok({ error: 'no' }, 404)
  }))
}

function fakeLab(): ProjectionLabState {
  return {
    op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
    stage: null, kit: null,
    s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
}

const version = (id: string, takeId: string, o: Partial<FrameVersion> = {}): FrameVersion =>
  ({ id, takeId, startKey: 'k', png: `/${id}.png`, seed: 1, jobId: null, credits: 1, approved: false, createdAt: 't', stale: false, ...o } as FrameVersion)
/** the draw bar's edit model, as useFrameEdit hands it over */
function model(takeId: string, versions: FrameVersion[], o: Partial<FrameEditModel> = {}): FrameEditModel {
  const inUse = versions.find((v) => v.approved && !v.stale) ?? null
  return { takeId, versions, inUse, using: null, base: inUse ?? versions[0] ?? null, shown: null, onShow: vi.fn(), onSelect: vi.fn(async () => {}),
    text: '', onText: vi.fn(), warning: null, gate: 'Say the one change first.', running: false, editing: false, phase: null, error: null, onPress: vi.fn(), ...o }
}
const press = (o: Partial<HeroPressModel> = {}): HeroPressModel =>
  ({ price: 5, drawing: false, phase: null, since: null, gate: null, title: 'Draws the first frame', disabled: false, onPress: vi.fn(), ...o })
function overlay(id: string, takeId: string, approved: boolean): HeroOverlayModel {
  return { still: { id, takeId, startKey: 'k', png: `/${id}.png`, seed: 1, jobId: null, credits: 1, approved, createdAt: 't', stale: false }, approved,
    redrawPrice: 5, running: false, error: null, onApprove: vi.fn(), onRedraw: vi.fn(), onChanged: vi.fn() } as unknown as HeroOverlayModel
}
const hero = (o: HeroOverlayModel | null, p: HeroPressModel | null = press()) =>
  act(() => publishHero({ prompt: {} as HeroPublished['prompt'], overlay: o, press: p }))

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); l2r = { [A]: ready(A), [B]: ready(B, { still: null }) }; serveL2R() })
afterEach(() => {
  cleanup(); act(() => { publishHero(null); publishFrameEdit(null) }); vi.unstubAllGlobals()
  resetCurrentTake(); resetSceneJobs(); resetL2RStore(); resetFrameView(); localStorage.clear()
})

describe('the take card follows the take', () => {
  it('take A shows its frame; a click opens the window on it; switching to take B (no frame) shows Draw the first frame and its price', async () => {
    setCurrentTake(A)
    const lab = fakeLab()
    hero(overlay('a-1', A, true))
    act(() => publishFrameEdit(model(A, [version('a-1', A, { approved: true })])))
    const { rerender } = render(<><TakeCard lab={lab} takeId={A} /><HeroOverlay /></>)
    expect(screen.getByTestId('take-card').getAttribute('data-take')).toBe(A)
    expect(screen.getByTestId('take-card-frame').querySelector('img')?.getAttribute('src')).toBe('/a-1.png')
    expect(screen.getByTestId('take-card-frame-label').textContent).toBe('First frame ✓')
    expect(screen.queryByTestId('hero-render')).toBeNull()
    expect(screen.queryByTestId('hero-overlay')).toBeNull()
    fireEvent.click(screen.getByTestId('take-card-frame'))
    expect(screen.getByTestId('hero-overlay-img').getAttribute('src')).toBe('/a-1.png') // the window opens on the take's frame
    fireEvent.click(screen.getByTestId('hero-overlay-close'))

    // the Prompt box names take B: its card at once, from B's models
    setCurrentTake(B)
    hero(null)
    act(() => publishFrameEdit(model(B, [])))
    rerender(<><TakeCard lab={lab} takeId={B} /><HeroOverlay /></>)
    expect(screen.getByTestId('take-card').getAttribute('data-take')).toBe(B)
    expect(screen.queryByTestId('take-card-frame')).toBeNull()
    const btn = screen.getByTestId('hero-render')
    expect(btn.textContent).toBe('Draw the first frame')
    expect(btn.parentElement?.textContent).toMatch(/5 cr/)
    expect(screen.getByTestId('draw-sent-pop')).toBeTruthy() // the words it sends, one click away
  })

  it('a frame carried over from the take it was re-locked from reads "carried over"; two fresh versions waiting read "pick one"', () => {
    setCurrentTake(A)
    hero(overlay('a-1', A, true))
    act(() => publishFrameEdit(model(A, [version('a-1', A, { approved: true, carriedFrom: 'take-old' } as Partial<FrameVersion>)])))
    const { rerender } = render(<TakeCard lab={fakeLab()} takeId={A} />)
    expect(screen.getByTestId('take-card-frame-label').textContent).toBe('First frame ✓ · carried over')
    hero(overlay('a-2', A, false))
    act(() => publishFrameEdit(model(A, [version('a-2', A), version('a-1', A)])))
    rerender(<TakeCard lab={fakeLab()} takeId={A} />)
    expect(screen.getByTestId('take-card-frame-label').textContent).toBe('First frame · pick one')
  })

  it('a done render of the take shows "Clip · N s ▶", opens the window on its Clip; another take shows none', async () => {
    l2r[A] = ready(A, { renders: [done] })
    setCurrentTake(A)
    hero(overlay('a-1', A, true))
    act(() => publishFrameEdit(model(A, [version('a-1', A, { approved: true })])))
    render(<TakeCard lab={fakeLab()} takeId={A} />)
    const clip = await screen.findByTestId('take-card-clip')
    expect(clip.textContent).toBe('Clip · 4 s ▶')
  })
})

describe('no Approve on the Stage', () => {
  it('the steps line, the take card and the open window with an awaiting still offer no Approve', async () => {
    setCurrentTake(A)
    l2r[A] = ready(A, { still: null })
    const lab = fakeLab()
    hero(overlay('a-2', A, false))
    act(() => publishFrameEdit(model(A, [version('a-2', A), version('a-1', A)])))
    const { container } = render(<><ShotSteps lab={lab} /><TakeCard lab={lab} takeId={A} /><HeroOverlay lab={lab} /></>)
    fireEvent.click(screen.getByTestId('take-card-frame'))
    await screen.findByTestId('frame-edit-dock')
    await screen.findByTestId('render-clip')
    const named = [...container.querySelectorAll('button')].map((b) => `${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''} ${b.title}`)
    expect(named.filter((n) => /approve/i.test(n))).toEqual([])
    for (const gone of ['hero-overlay-approve', 'frame-view', 'frame-pick', 'step-draw', 'step-render', 'step-new-take', 'new-take-line']) {
      expect(screen.queryByTestId(gone)).toBeNull()
    }
    await waitFor(() => expect(screen.getByTestId('step-cue').textContent).not.toMatch(/approve/i))
  })
})
