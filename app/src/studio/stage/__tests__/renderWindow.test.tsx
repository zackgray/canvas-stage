// @vitest-environment jsdom
// The first-frame window's render, as the owner's 10-29 run needed it: the Render press names the version it renders and says so
// plainly when the picture on screen is another one, and holds while an edit or a version change is still out (fix B); a render that
// finishes shows: the take card's clip is the new one, "Clip ready" in the window, and the window plays it, Clip being the default
// once the render is the newest thing and Still again after a version is picked (fixes C, E); the render's words in "What will be
// sent" are editable, sent as written, Reset back, and said to be older when the take's words move (fix G); the first frame's draw
// opens the window at once in its working state (fix D). Published fakes for the hero and edit models; the l2r route is faked.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { L2RListResponse, L2RRender, TakeRecord } from '../../../shared/shotContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { refresh, resetL2RStore } from '../../render/l2rStore'
import type { L2RStatusExtra } from '../../render/l2rExtra'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetFrameView, setFrameView } from '../../shoot/firstFrameView'
import { HeroOverlay } from '../../shoot/HeroOverlay'
import { publishHero, type HeroOverlayModel, type HeroPressModel, type HeroPublished } from '../../shoot/heroPublished'
import { publishFrameEdit } from '../frameEditStore'
import { HOLD_EDIT, HOLD_PICK } from '../RenderClip'
import { EDITED_LINE, OLDER_LINE } from '../SentJobs'
import { resetSentEdits } from '../sentEdits'
import { TakeCard } from '../TakeCard'
import type { FrameEditModel, FrameVersion } from '../useFrameEdit'

const A = 'take-2026-10-29T20-01-28-148'
const takeRec: TakeRecord = { id: A, worldId: 'loc-1', packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt: '2026-10-29T20:00:00.000Z', createdAt: '2026-10-29T20:00:00.000Z' }
const HELMET = 'remove the helmet inside the car'
const version = (id: string, o: Partial<FrameVersion> = {}): FrameVersion =>
  ({ id, takeId: A, startKey: 'k', png: `/${id}.png`, seed: 1, jobId: null, credits: 1, approved: false, createdAt: '2026-10-29T22:54:16.512Z', stale: false, ...o } as FrameVersion)
const ORIGINAL = version('hero-1')
const EDIT = version('hero-1-e1', { editOf: 'hero-1', prompt: HELMET, createdAt: '2026-10-29T22:57:54.106Z' })
const rendered = (id: string, stillId: string, createdAt: string, finished = `/${id}-finished.mp4`): L2RRender =>
  ({ id, takeId: A, stillId, clay: '/clay.mp4', raw: `/${id}-raw.mp4`, finished, jobId: 'j', credits: 28, status: 'done', createdAt, frames: 96 } as L2RRender)
const stillRec = (id: string) => ({ id, takeId: A, startKey: 'k', png: `/${id}.png`, seed: 1, jobId: null, credits: 1, approved: true, createdAt: 't' })
const ready = (o: Partial<L2RListResponse & L2RStatusExtra> = {}): L2RListResponse & L2RStatusExtra => ({ renders: [], take: takeRec,
  clay: { takeId: A, startKey: 'k', mp4: '/clay.mp4', frames: 97, width: 1920, height: 1088, status: 'done' },
  still: stillRec('hero-1'), missing: [], prompt: 'A driver walks to the car.', configured: true,
  estimate: { credits: 31, perFrame: 0.31, frames: 97, basis: 'about 0.31 cr per frame' }, running: null, finishing: [], ...o })

let l2r: L2RListResponse & L2RStatusExtra
let posts: Record<string, unknown>[]
let hold: Promise<void> | null
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
function serveL2R() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u === '/__lab/takes') return ok({ takes: [takeRec] })
    if (u.startsWith('/__lab/l2r?take=')) return ok(l2r)
    if (u === '/__lab/l2r/prompt') return ok({ text: JSON.parse(String(init?.body)).text })
    if (init?.method === 'POST' && u === '/__lab/l2r') {
      posts.push(JSON.parse(String(init.body)))
      if (hold) await hold
      return ok({ render: l2r.renders[0] })
    }
    return ok({ error: 'no' }, 404)
  }))
}
function fakeLab(): ProjectionLabState {
  return {
    op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
    stage: null, kit: null, s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
}
function model(versions: FrameVersion[], o: Partial<FrameEditModel> = {}): FrameEditModel {
  const inUse = versions.find((v) => v.approved && !v.stale) ?? null
  return { takeId: A, versions, inUse, using: null, base: inUse, shown: null, onShow: vi.fn(), onSelect: vi.fn(async () => {}),
    text: '', onText: vi.fn(), warning: null, gate: 'Say the one change first.', running: false, editing: false, phase: null, error: null, onPress: vi.fn(), ...o }
}
const press = (o: Partial<HeroPressModel> = {}): HeroPressModel => ({ price: 5, drawing: false, phase: null, since: null, gate: null, title: 'Draws', disabled: false, onPress: vi.fn(), ...o })
const overlay = (v: FrameVersion): HeroOverlayModel => ({ still: { ...v, stale: false }, approved: v.approved, redrawPrice: 5, running: false, error: null,
  onApprove: vi.fn(), onRedraw: vi.fn(), onChanged: vi.fn() } as unknown as HeroOverlayModel)
const hero = (o: HeroOverlayModel | null, p: HeroPressModel | null = press()) => act(() => publishHero({ prompt: {} as HeroPublished['prompt'], overlay: o, press: p }))
const edit = (m: FrameEditModel) => act(() => publishFrameEdit(m))
/** the window open on the version in use, as the take card's thumbnail opens it */
async function openOn(v: FrameVersion, m: FrameEditModel) {
  hero(overlay(v)); edit(m)
  render(<><TakeCard lab={fakeLab()} takeId={A} /><HeroOverlay lab={fakeLab()} /></>)
  act(() => setFrameView(v.id, 'still'))
  return screen.findByTestId('hero-overlay')
}

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); setCurrentTake(A); l2r = ready(); posts = []; hold = null; serveL2R() })
afterEach(() => {
  cleanup(); act(() => { publishHero(null); publishFrameEdit(null) }); vi.unstubAllGlobals()
  resetCurrentTake(); resetSceneJobs(); resetL2RStore(); resetFrameView(); resetSentEdits(); localStorage.clear()
})

describe('the Render press names the version it renders (fix B)', () => {
  it('after the edit is the frame in use, the press says so and sends that version', async () => {
    l2r = ready({ still: stillRec(EDIT.id) })
    const e = { ...EDIT, approved: true }
    await openOn(e, model([e, ORIGINAL], { shown: e }))
    expect((await screen.findByTestId('render-target')).textContent).toBe('Renders: Edit 1 (remove the helmet inside the…) ✓')
    expect(screen.getByTestId('render-target').querySelector('img')?.getAttribute('src')).toBe(`/${EDIT.id}.png`)
    expect(screen.queryByTestId('render-target-other')).toBeNull()
    const btn = screen.getByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ takeId: A, stillId: EDIT.id })
  })

  it('says plainly when the picture on screen is not the version that will render', async () => {
    const o = { ...ORIGINAL, approved: true }
    await openOn(o, model([EDIT, o], { shown: EDIT }))
    expect((await screen.findByTestId('render-target')).textContent).toBe('Renders: Draw 1 ✓')
    expect(screen.getByTestId('render-target-other').textContent).toMatch(/^On screen is Edit 1 \(remove the helmet inside the…\), but the render uses Draw 1, the version with the ✓/)
  })

  it('holds while an edit runs, and while a new version in use is not read by the render yet: a press then renders nothing old', async () => {
    const o = { ...ORIGINAL, approved: true }
    await openOn(o, model([o], { editing: true, running: true }))
    const btn = await screen.findByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(screen.getByTestId('render-why').textContent).toBe(HOLD_EDIT))
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    // the edit lands and is in use, but the render's facts still name the original: still held
    const e = { ...EDIT, approved: true }
    edit(model([e, { ...ORIGINAL, approved: false }], { shown: e }))
    await waitFor(() => expect(screen.getByTestId('render-why').textContent).toBe(HOLD_PICK))
    expect(posts).toEqual([])
    l2r = ready({ still: stillRec(EDIT.id) })
    await act(() => refresh())
    await waitFor(() => expect(screen.queryByTestId('render-why')).toBeNull())
    expect(screen.getByTestId('render-target').textContent).toMatch(/^Renders: Edit 1/)
  })
})

describe('a render that finishes shows (fixes C and E)', () => {
  it('the window plays the new clip, says Clip ready, and the take card shows the new clip; picking a version goes back to Still', async () => {
    const old = rendered('l2r-old', 'hero-1', '2026-10-29T20:45:47.859Z')
    l2r = ready({ renders: [old] })
    const o = { ...ORIGINAL, approved: true, createdAt: '2026-10-29T22:54:16.512Z' }
    const m = model([o], { shown: o })
    await openOn(o, m)
    // the old clip predates the version in use: the window opens on the still
    expect(screen.getByTestId('hero-overlay-img').getAttribute('src')).toBe('/hero-1.png')
    // the press: the server holds the POST while it renders, then answers done
    let release!: () => void
    hold = new Promise((r) => { release = r })
    const btn = await screen.findByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    await screen.findByTestId('render-pill') // working at once
    const fresh = rendered('l2r-new', 'hero-1', '2026-10-29T22:58:42.431Z')
    l2r = ready({ renders: [fresh, old] })
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 20)) })
    await waitFor(() => expect(screen.getByTestId('hero-overlay-clip').getAttribute('src')).toBe('/l2r-new-finished.mp4'))
    expect(screen.getByTestId('render-clip-ready').textContent).toMatch(/^Clip ready/)
    expect(screen.getByTestId('render-clip-open').getAttribute('href')).toMatch(/render/)
    expect(screen.getByTestId('take-card-clip').querySelector('video')?.getAttribute('src')).toBe('/l2r-new-finished.mp4')
    expect(screen.getByTestId('frame-picture-clip').getAttribute('aria-pressed')).toBe('true')
    // Clay and Clip sit in the same place: the same picture box
    fireEvent.click(screen.getByTestId('frame-picture-clay'))
    expect(screen.getByTestId('hero-overlay-img').className).toBe('st-hero-overlay-img')
    fireEvent.click(screen.getByTestId('frame-picture-clip'))
    expect(screen.getByTestId('hero-overlay-clip').className).toBe('st-hero-overlay-img')
    // a version picked (or an edit landing) shows the still: what will render
    edit({ ...m, shown: EDIT, versions: [EDIT, o] })
    await waitFor(() => expect(screen.queryByTestId('hero-overlay-clip')).toBeNull())
    expect(screen.getByTestId('hero-overlay-img').getAttribute('src')).toBe(`/${EDIT.id}.png`)
  })

  it('opens on the Clip once the take\'s render is the newest thing', async () => {
    l2r = ready({ renders: [rendered('l2r-new', 'hero-1', '2026-10-29T22:58:42.431Z')] })
    const o = { ...ORIGINAL, approved: true }
    hero(overlay(o)); edit(model([o]))
    render(<><TakeCard lab={fakeLab()} takeId={A} /><HeroOverlay lab={fakeLab()} /></>)
    await screen.findByTestId('take-card-clip')
    act(() => setFrameView(o.id, 'still'))
    expect((await screen.findByTestId('hero-overlay-clip')).getAttribute('src')).toBe('/l2r-new-finished.mp4')
  })
})

describe('the render words are editable (fix G)', () => {
  it('an edit is sent as written and sticks to the take; Reset goes back; moved take words say the edit is older', async () => {
    const o = { ...ORIGINAL, approved: true }
    await openOn(o, model([o]))
    const box = await screen.findByTestId('render-sent-0-text') as HTMLTextAreaElement
    expect(box.value).toBe('A driver walks to the car.')
    expect(screen.getByTestId('render-sent-pop').hasAttribute('open')).toBe(false) // folded by default
    fireEvent.change(box, { target: { value: 'A driver, helmet off, walks to the car.' } })
    expect(screen.getByTestId('render-sent-0-edited').textContent).toMatch(EDITED_LINE)
    const btn = screen.getByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    expect(btn.parentElement?.textContent).toMatch(/31 cr/) // the price is unchanged
    fireEvent.click(btn)
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ stillId: 'hero-1', prompt: 'A driver, helmet off, walks to the car.' })
    // the take's words move: the edit is older than them
    l2r = ready({ prompt: 'A driver runs to the car.' })
    await act(() => refresh())
    expect((await screen.findByTestId('render-sent-0-older')).textContent).toMatch(OLDER_LINE)
    fireEvent.click(screen.getByTestId('render-sent-0-keep'))
    expect(screen.queryByTestId('render-sent-0-older')).toBeNull()
    expect((screen.getByTestId('render-sent-0-text') as HTMLTextAreaElement).value).toBe('A driver, helmet off, walks to the car.')
    fireEvent.click(screen.getByTestId('render-sent-0-reset'))
    expect((screen.getByTestId('render-sent-0-text') as HTMLTextAreaElement).value).toBe('A driver runs to the car.')
    expect(screen.queryByTestId('render-sent-0-edited')).toBeNull()
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(screen.getByTestId('render-primary'))
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1]).not.toHaveProperty('prompt') // the composed words again
    expect(posts[1]).toMatchObject({ stillId: posts[0].stillId }) // the first frame (and the clay) unchanged by any of it
  })
})

describe('the first frame\'s draw opens the window at once (fix D)', () => {
  it('pressed with no frame yet: the window opens in its working state, then on the frame that lands', async () => {
    hero(null, press())
    edit(model([]))
    render(<><TakeCard lab={fakeLab()} takeId={A} /><HeroOverlay lab={fakeLab()} /></>)
    expect(screen.queryByTestId('hero-overlay-pending')).toBeNull()
    hero(null, press({ drawing: true, phase: 'Updating the frames…', disabled: true }))
    expect(await screen.findByTestId('hero-overlay-pending')).toBeTruthy()
    expect(screen.getByTestId('frame-pending-dock').textContent).toMatch(/Updating the frames…/)
    const o = { ...ORIGINAL, approved: true }
    hero(overlay(o), press({ drawing: false }))
    edit(model([o]))
    await screen.findByTestId('hero-overlay')
    expect(screen.queryByTestId('hero-overlay-pending')).toBeNull()
  })
})
