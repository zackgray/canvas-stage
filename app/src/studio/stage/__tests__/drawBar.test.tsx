// @vitest-environment jsdom
// The Stage's draw bar (merge step 7): the transport; the still block's priced "Draw the first frame" press (published by the
// block, shown in its place: the take card's DrawPress, owner 10-29) and the Render press (the Render page's primary: the
// first-frame window's RenderClip, read through useStageRender). Prices before the press, the gate as the grey
// reason, the pill in place of the press while a job runs, one POST per press — exactly the moved behavior, never in two places.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { L2RListResponse, L2RRender, TakeRecord } from '../../../shared/shotContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { DrawBar } from '../DrawBar'
import { DrawPress } from '../DrawPress'
import { RenderClip } from '../RenderClip'
import { useStageRender } from '../useStageRender'
import { HeroStillBlock } from '../../shoot/HeroStillBlock'
import { heroCredits } from '../../../../server/hero/spec'
import { kitFinishCredits } from '../../../../server/hero/kitSpec'
import { resetL2RStore } from '../../render/l2rStore'
import type { L2RStatusExtra } from '../../render/l2rExtra'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { base, serve } from '../../shoot/__tests__/heroStillHarness'

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); resetClayStore(); setCurrentTake('take-1'); sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); localStorage.clear() })

/** the lab slice the bar and the block read: a real operator engine around the faked world */
function fakeLab(source = 'loc-1') {
  return {
    op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
    stage: null,
    s: { source, look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
}

/** the draw press where the Stage shows it (the take card / the window), with no 3D piece building */
const Press = (_: { lab: ProjectionLabState }) => <DrawPress verb="Draw the first frame" primary building={false} worldId={null} />
/** the Render press as the first-frame window shows it */
function RenderPress({ lab }: { lab: ProjectionLabState }) { return <RenderClip r={useStageRender(lab)} /> }

describe('the draw bar’s hero press', () => {
  it('shows the priced press in the bar, in the block\'s place; one press is one capture and one paid POST', async () => {
    const s = base(); serve(s)
    const lab = fakeLab()
    const capture = vi.fn(async () => new Blob(['png']))
    render(<><HeroStillBlock lab={lab} capture={capture} pressInBar /><Press lab={lab} /></>)
    const btn = await screen.findByTestId('hero-render')
    expect(btn.textContent).toBe('Draw the first frame')
    expect(btn.parentElement?.textContent).toMatch(new RegExp(`${heroCredits(1)} cr`))
    expect(screen.queryByTestId('hero-block')!.querySelector('[data-testid="hero-render"]')).toBeNull() // its place is the bar
    fireEvent.click(btn)
    await screen.findByTestId('hero-still-hero-new1')
    expect(capture).toHaveBeenCalledTimes(1)
    expect(s.calls.filter((c) => c === 'POST /__lab/hero')).toEqual(['POST /__lab/hero'])
  })

  it('greys with its one reason (another set on the stage) until the gate passes; a grey press spends nothing', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' } }); serve(s)
    const lab = fakeLab('loc-2') // the take was locked on loc-1
    render(<><HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} pressInBar /><Press lab={lab} /></>)
    const btn = await screen.findByTestId('hero-render') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.title).toMatch(/another set/)
    fireEvent.click(btn)
    await new Promise((r) => setTimeout(r, 20))
    expect(s.calls.filter((c) => c.startsWith('POST'))).toEqual([])
  })

  it('the pill takes the press\'s place while a draw runs, clock and spent price included', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' } }); serve(s)
    const served = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', vi.fn((u: string, i?: RequestInit) => (u === '/__lab/hero' && i?.method === 'POST' ? new Promise<Response>(() => {}) : served(u, i))))
    const lab = fakeLab()
    render(<><HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} pressInBar /><Press lab={lab} /></>)
    fireEvent.click(await screen.findByTestId('hero-render'))
    const pill = await screen.findByTestId('hero-phase')
    expect(screen.queryByTestId('hero-render')).toBeNull() // the pill is where the press was
    expect(pill.querySelector('.st-progress-time')?.textContent).toMatch(/^\d+:\d{2}$/)
    expect(screen.getByTestId('hero-phase-spent').textContent).toMatch(/^≈ [\d.]+ cr spent$/)
  })

  it('no locked take: the block says so and the bar shows no Draw press at all', async () => {
    resetCurrentTake()
    serve(base({ takes: [] }))
    const lab = fakeLab()
    render(<><HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} pressInBar /><Press lab={lab} /></>)
    expect((await screen.findByTestId('hero-no-take')).textContent).toMatch(/Lock a take first/)
    expect(screen.queryByTestId('hero-render')).toBeNull()
  })
})

describe("the first frame's Recover and Finish sit by the press, only when they apply, and never draw again", () => {
  it('a paid draw that never came back offers Recover the drawing: it fetches by job id, never a second draw', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, renderError: { error: 'job abc did not finish; recover by id', code: 'submit', jobId: 'aaaaaaaa-0000-4000-8000-000000000001' } }); serve(s)
    const lab = fakeLab()
    render(<><HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} pressInBar bare /><Press lab={lab} /></>)
    expect(screen.queryByTestId('hero-recover')).toBeNull()
    fireEvent.click(await screen.findByTestId('hero-render'))
    const rec = await screen.findByTestId('hero-recover')
    expect(rec.textContent).toBe('Recover the drawing')
    fireEvent.click(rec)
    await waitFor(() => expect(s.calls).toContain('POST /__lab/jobs/recover'))
    expect(s.calls.filter((c) => c === 'POST /__lab/hero')).toHaveLength(1)
  })
  it('a drawing stopped before its last step offers Finish the frame with its own price; it runs only that step', async () => {
    const s = base({ unfinished: [{ id: 'hero-d1', role: 'opening', frame: 0, png: '/x/hero-d1-draw.png', createdAt: 't', startKey: 'aaaa0001' }] }); serve(s)
    const lab = fakeLab()
    render(<><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} pressInBar bare /><Press lab={lab} /></>)
    const btn = await screen.findByTestId('hero-finish')
    expect(btn.textContent).toBe('Finish the frame')
    expect(screen.getByTestId('hero-unfinished').textContent).toMatch(new RegExp(`stopped before its last step.*${kitFinishCredits(1)} cr`))
    fireEvent.click(btn)
    await waitFor(() => expect(s.calls).toContain('POST /__lab/hero/finish'))
    expect(s.calls).not.toContain('POST /__lab/hero')
  })
})

// —— the Render press (the Render page's primary moved here; faked takes / l2r routes, never a Cloud call) ——
const TAKE = 'take-2026-10-22T19-00-00-000'
const takeRec: TakeRecord = { id: TAKE, worldId: 'loc-1', packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt: '2026-10-22T19:00:00.000Z', createdAt: '2026-10-22T19:00:00.000Z' }
const done: L2RRender = { id: 'l2r-1', takeId: TAKE, stillId: 'still-1', clay: '/clay.mp4', raw: '/raw.mp4', finished: '/fin.mp4', jobId: 'job-1', credits: 21, status: 'done', createdAt: 't' }
const ready = (o: Partial<L2RListResponse & L2RStatusExtra> = {}): L2RListResponse & L2RStatusExtra => ({ renders: [], take: takeRec, clay: { takeId: TAKE, startKey: 'k', mp4: '/clay.mp4', frames: 97, width: 1920, height: 1088, status: 'done' },
  still: { id: 'still-1', takeId: TAKE, startKey: 'k', png: '/s.png', seed: 1, jobId: null, credits: 1, approved: true, createdAt: 't' }, missing: [], prompt: 'A man.', configured: true,
  estimate: { credits: 21, perFrame: 0.21, frames: 97, basis: 'about 0.21 cr per frame' }, running: null, finishing: [], ...o })

let l2r: L2RListResponse & L2RStatusExtra
let posts: string[]
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
/** the takes and l2r routes, faked; a POST /__lab/l2r is counted, never sent anywhere */
function serveL2R() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return ok({ takes: [takeRec] })
    if (String(url).startsWith('/__lab/l2r?take=')) return ok(l2r)
    if (init?.method === 'POST' && String(url).startsWith('/__lab/l2r')) { posts.push(String(url)); return ok({ render: done }) }
    return ok({ error: 'no' }, 404)
  }))
}

describe("the draw bar's Render press", () => {
  beforeEach(() => { l2r = ready(); posts = []; setCurrentTake(TAKE) })

  it('greys with "Lock a take first." until a take is locked; the transport rides the bar either way', async () => {
    l2r = ready({ take: null, clay: null, still: null, missing: [{ code: 'no_take', message: 'No locked take.', where: 'On the Stage.' }] })
    serveL2R()
    render(<RenderPress lab={fakeLab()} />)
    const btn = await screen.findByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(true))
    expect(btn.textContent).toMatch(/Render/)
    expect(btn.title).toBe('Lock a take first.')
    expect(btn.className).not.toMatch(/st-primary/) // not the next step: quiet
    cleanup()
    render(<DrawBar lab={fakeLab()} />)
    expect(screen.getByTestId('draw-bar').querySelector('[data-testid="stage-transport"]')).toBeTruthy()
    expect(screen.queryByTestId('clay-toggle')).toBeNull() // no Clay|Look switch on the Stage
    expect(screen.queryByTestId('render-primary')).toBeNull() // the presses live in the take card and the first-frame window now
    expect(screen.queryByTestId('frame-edit')).toBeNull() // "Edit this frame" lives under the full-screen still now (owner 10-29)
    expect(screen.queryByTestId('frame-versions')).toBeNull()
  })

  it('with no take locked in the Camera panel (a fresh recording), Render says to lock one, whatever older take is on disk', async () => {
    resetCurrentTake()
    serveL2R()
    render(<RenderPress lab={fakeLab()} />)
    const btn = await screen.findByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(btn.title).toBe('Lock a take first.'))
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(posts).toEqual([])
  })

  it('shows the server\'s price and runs exactly one POST per press', async () => {
    serveL2R()
    render(<RenderPress lab={fakeLab()} />)
    const btn = await screen.findByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    expect(btn.parentElement?.textContent).toMatch(/≈ 21 cr/)
    fireEvent.click(btn)
    await waitFor(() => expect(posts).toEqual(['/__lab/l2r']))
    expect(posts).toHaveLength(1)
  })

  it('the pill takes the press\'s place while a render runs, with the price it already spent', async () => {
    l2r = ready({ running: { since: new Date().toISOString(), what: `l2r ${TAKE} l2r-2` }, renders: [{ ...done, id: 'l2r-2', status: 'running', raw: null, finished: null }] })
    serveL2R()
    render(<RenderPress lab={fakeLab()} />)
    const pill = await screen.findByTestId('render-pill')
    expect(screen.queryByTestId('render-primary')).toBeNull()
    expect(pill.textContent).toMatch(/rendering on Comfy Cloud/)
    expect(screen.getByTestId('render-pill-spent').textContent).toBe('≈ 21 cr spent')
  })
})
